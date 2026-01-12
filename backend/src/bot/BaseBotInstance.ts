import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';
import { prisma } from '../lib/prisma.js';
import { emitToBot } from '../lib/socket.js';

const { GoalNear, GoalGetToBlock } = goals;

export interface BotStatus {
  connected: boolean;
  spawned: boolean;
  health?: number;
  food?: number;
  position?: { x: number; y: number; z: number };
  dimension?: string;
  gameMode?: string;
  serverVersion?: string;
  currentAction?: string;
  // Type-specific status fields can be added by subclasses
  [key: string]: any;
}

export interface BotConnectionOptions {
  host: string;
  port: number;
  version?: string;
}

export interface BotTypeConfig {
  type: string;
  name: string;
  description: string;
  icon: string;
  // Setup steps specific to this bot type (after common auth/server steps)
  setupSteps: SetupStep[];
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  // Component name for frontend to render
  component: string;
}

/**
 * Abstract base class for all bot types.
 * Contains shared functionality like connection, authentication, movement, and status.
 * Subclasses implement type-specific behaviors (storage indexing, farming, PvP, etc.)
 */
export abstract class BaseBotInstance extends EventEmitter {
  public id: string;
  public userId: string;
  public abstract readonly botType: string;
  
  protected bot: Bot | null = null;
  protected status: BotStatus = { connected: false, spawned: false };
  protected microsoftEmail: string | null = null;
  protected offlineMode: boolean = false;
  protected offlineUsername: string | null = null;
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 3;
  protected lastMoveEmit: number = 0;
  protected moveEmitThrottle: number = 500;

  constructor(botId: string, userId: string) {
    super();
    this.id = botId;
    this.userId = userId;
  }

  // ============ ABSTRACT METHODS (must be implemented by subclasses) ============
  
  /**
   * Get type-specific configuration for this bot type
   */
  abstract getTypeConfig(): BotTypeConfig;

  /**
   * Execute a task specific to this bot type
   */
  abstract executeTask(task: any): Promise<void>;

  /**
   * Cancel the current task if running
   */
  abstract cancelCurrentTask(taskId: string): void;

  /**
   * Get type-specific status fields
   */
  protected abstract getTypeSpecificStatus(): Record<string, any>;

  // ============ SHARED FUNCTIONALITY ============

  async loadFromDatabase(): Promise<void> {
    const dbBot = await prisma.bot.findUnique({
      where: { id: this.id },
    });
    if (dbBot) {
      this.microsoftEmail = dbBot.microsoftEmail;
      this.offlineMode = dbBot.useOfflineAccount || false;
      this.offlineUsername = dbBot.offlineUsername;
    }
  }

  setOfflineMode(username: string): void {
    this.offlineMode = true;
    this.offlineUsername = username;
  }

  setMicrosoftEmail(email: string): void {
    this.microsoftEmail = email;
  }

  getStatus(): BotStatus {
    if (!this.bot) {
      return { connected: false, spawned: false };
    }

    return {
      connected: this.status.connected,
      spawned: this.status.spawned,
      health: this.bot.health,
      food: this.bot.food,
      position: this.bot.entity?.position
        ? {
            x: Math.floor(this.bot.entity.position.x),
            y: Math.floor(this.bot.entity.position.y),
            z: Math.floor(this.bot.entity.position.z),
          }
        : undefined,
      dimension: this.bot.game?.dimension,
      gameMode: this.bot.game?.gameMode,
      serverVersion: this.bot.version,
      currentAction: this.status.currentAction,
      // Merge in type-specific status
      ...this.getTypeSpecificStatus(),
    };
  }

  getMineflayerBot(): Bot | null {
    return this.bot;
  }

  async connect(options: BotConnectionOptions): Promise<void> {
    if (!this.offlineMode && !this.microsoftEmail) {
      throw new Error('Microsoft account not configured');
    }

    if (this.bot) {
      try {
        if (typeof this.bot.quit === 'function') {
          this.bot.quit();
        } else if (typeof this.bot.end === 'function') {
          this.bot.end();
        }
      } catch (e) {
        console.log(`[Bot ${this.id}] Error disconnecting existing bot:`, e);
      }
      this.bot = null;
    }

    return new Promise((resolve, reject) => {
      try {
        if (this.offlineMode) {
          this.bot = mineflayer.createBot({
            host: options.host,
            port: options.port,
            username: this.offlineUsername || 'Bot',
            auth: 'offline',
            version: options.version || false as any,
          });
        } else {
          this.bot = mineflayer.createBot({
            host: options.host,
            port: options.port,
            username: this.microsoftEmail!,
            auth: 'microsoft',
            version: options.version || false as any,
            profilesFolder: `./auth_cache/${this.id}`,
            onMsaCode: (data: { user_code: string; verification_uri: string; message: string }) => {
              console.log(`[Bot ${this.id}] Emitting bot:msaCode to room bot:${this.id}`);
              emitToBot(this.id, 'bot:msaCode', {
                botId: this.id,
                userCode: data.user_code,
                verificationUri: data.verification_uri,
                message: data.message,
              });
            },
          });
        }

        this.bot.loadPlugin(pathfinder);
        this.setupEventListeners();

        this.bot.once('spawn', () => {
          this.status.connected = true;
          this.status.spawned = true;
          this.reconnectAttempts = 0;

          if (this.bot) {
            const movements = new Movements(this.bot);
            movements.canDig = false;
            movements.allow1by1towers = false;
            movements.allowParkour = true;
            movements.allowSprinting = true;
            this.bot.pathfinder.setMovements(movements);
          }

          this.updateDatabase({ isOnline: true, lastSeen: new Date() });
          this.emitStatus();
          resolve();
        });

        this.bot.once('error', (err) => {
          if (!this.status.spawned) {
            reject(err);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  protected setupEventListeners(): void {
    if (!this.bot) return;

    this.bot.on('health', () => this.emitStatus());

    this.bot.on('move', () => {
      const now = Date.now();
      if (now - this.lastMoveEmit >= this.moveEmitThrottle) {
        this.lastMoveEmit = now;
        this.emitStatus();
      }
    });

    this.bot.on('death', () => {
      this.status.currentAction = 'respawning';
      this.emitStatus();
    });

    this.bot.on('respawn', () => {
      this.status.currentAction = undefined;
      this.emitStatus();
    });

    this.bot.on('end', (reason) => {
      console.log(`Bot ${this.id} disconnected: ${reason}`);
      this.status.connected = false;
      this.status.spawned = false;
      this.updateDatabase({ isOnline: false, lastSeen: new Date() });
      this.emitStatus();
    });

    this.bot.on('kicked', (reason) => {
      console.log(`Bot ${this.id} kicked: ${reason}`);
      emitToBot(this.id, 'bot:kicked', { botId: this.id, reason: reason.toString() });
    });

    this.bot.on('error', (err) => {
      console.error(`Bot ${this.id} error:`, err);
      emitToBot(this.id, 'bot:error', { botId: this.id, error: err.message });
    });

    this.bot.on('chat', (username, message) => {
      emitToBot(this.id, 'bot:chat', { botId: this.id, username, message });
    });
  }

  protected emitStatus(): void {
    emitToBot(this.id, 'bot:status', { botId: this.id, ...this.getStatus() });
  }

  protected async updateDatabase(data: any): Promise<void> {
    try {
      await prisma.bot.update({
        where: { id: this.id },
        data,
      });
    } catch (error) {
      console.error('Failed to update bot in database:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      try {
        this.bot.quit();
      } catch (e) {
        console.log(`[Bot ${this.id}] Error during quit:`, e);
      }
      this.bot = null;
    }
    this.status = { connected: false, spawned: false };
    await this.updateDatabase({ isOnline: false, lastSeen: new Date() });
    this.emitStatus();
  }

  // ============ MOVEMENT UTILITIES ============

  async moveTo(x: number, y: number, z: number): Promise<void> {
    if (!this.bot || !this.status.spawned) {
      throw new Error('Bot not connected');
    }

    this.status.currentAction = `Moving to ${x}, ${y}, ${z}`;
    this.emitStatus();

    try {
      await this.bot.pathfinder.goto(new GoalNear(x, y, z, 2));
      this.status.currentAction = undefined;
      this.emitStatus();
    } catch (error) {
      this.status.currentAction = undefined;
      this.emitStatus();
      throw error;
    }
  }

  async moveToBlock(x: number, y: number, z: number): Promise<void> {
    if (!this.bot || !this.status.spawned) {
      throw new Error('Bot not connected');
    }

    await this.bot.pathfinder.goto(new GoalGetToBlock(x, y, z));
  }

  // ============ COMMON UTILITIES ============

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Look at a position with force=true and verify the look completed.
   */
  protected async lookAtWithRetry(position: Vec3, maxRetries: number = 3): Promise<boolean> {
    if (!this.bot) return false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const beforeYaw = this.bot.entity.yaw;
      const beforePitch = this.bot.entity.pitch;

      await this.bot.lookAt(position, true);
      await this.bot.waitForTicks(3);

      const afterYaw = this.bot.entity.yaw;
      const afterPitch = this.bot.entity.pitch;

      const yawChanged = Math.abs(beforeYaw - afterYaw) > 0.01;
      const pitchChanged = Math.abs(beforePitch - afterPitch) > 0.01;

      if (yawChanged || pitchChanged || attempt > 1) {
        return true;
      }

      await this.sleep(50);
    }
    return false;
  }

  /**
   * Update current action and emit status
   */
  protected setCurrentAction(action: string | undefined): void {
    this.status.currentAction = action;
    this.emitStatus();
  }
}

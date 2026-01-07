import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';
import { prisma } from '../lib/prisma.js';
import { emitToBot } from '../lib/socket.js';

const { GoalBlock, GoalNear, GoalGetToBlock } = goals;

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
}

export interface BotConnectionOptions {
  host: string;
  port: number;
  version?: string;
}

export class BotInstance extends EventEmitter {
  public id: string;
  public userId: string;
  private bot: Bot | null = null;
  private status: BotStatus = { connected: false, spawned: false };
  private microsoftEmail: string | null = null;
  private offlineMode: boolean = false;
  private offlineUsername: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isIndexing = false;

  constructor(botId: string, userId: string) {
    super();
    this.id = botId;
    this.userId = userId;
  }

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
    };
  }

  async connect(options: BotConnectionOptions): Promise<void> {
    // Validate auth method
    if (!this.offlineMode && !this.microsoftEmail) {
      throw new Error('Microsoft account not configured');
    }

    if (this.bot) {
      this.bot.quit();
      this.bot = null;
    }

    return new Promise((resolve, reject) => {
      try {
        if (this.offlineMode) {
          // Offline/cracked mode for LAN testing
          this.bot = mineflayer.createBot({
            host: options.host,
            port: options.port,
            username: this.offlineUsername || 'StorageBot',
            auth: 'offline',
            version: options.version || false as any,
          });
        } else {
          // Online mode with Microsoft auth
          this.bot = mineflayer.createBot({
            host: options.host,
            port: options.port,
            username: this.microsoftEmail!,
            auth: 'microsoft',
            version: options.version || false as any,
            profilesFolder: `./auth_cache/${this.id}`,
            onMsaCode: (data: { user_code: string; verification_uri: string; message: string }) => {
              // Emit the device code to the frontend via WebSocket
              emitToBot(this.id, 'bot:msaCode', {
                botId: this.id,
                userCode: data.user_code,
                verificationUri: data.verification_uri,
                message: data.message,
              });
              console.log(`[Bot ${this.id}] Microsoft auth code: ${data.user_code}`);
            },
          });
        }

        this.bot.loadPlugin(pathfinder);

        this.setupEventListeners();

        this.bot.once('spawn', () => {
          this.status.connected = true;
          this.status.spawned = true;
          this.reconnectAttempts = 0;
          
          // Setup pathfinder
          if (this.bot) {
            const movements = new Movements(this.bot);
            movements.canDig = false; // Don't break blocks
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

  private setupEventListeners(): void {
    if (!this.bot) return;

    // Status updates
    this.bot.on('health', () => this.emitStatus());

    this.bot.on('move', () => {
      // Throttle position updates
      this.emitStatus();
    });

    this.bot.on('death', () => {
      this.status.currentAction = 'respawning';
      this.emitStatus();
    });

    this.bot.on('respawn', () => {
      this.status.currentAction = undefined;
      this.emitStatus();
    });

    // Disconnection
    this.bot.on('end', (reason) => {
      console.log(`Bot ${this.id} disconnected: ${reason}`);
      this.status.connected = false;
      this.status.spawned = false;
      this.updateDatabase({ isOnline: false, lastSeen: new Date() });
      this.emitStatus();
      
      // Auto-reconnect logic could go here
    });

    this.bot.on('kicked', (reason) => {
      console.log(`Bot ${this.id} kicked: ${reason}`);
      emitToBot(this.id, 'bot:kicked', { botId: this.id, reason: reason.toString() });
    });

    this.bot.on('error', (err) => {
      console.error(`Bot ${this.id} error:`, err);
      emitToBot(this.id, 'bot:error', { botId: this.id, error: err.message });
    });

    // Chat
    this.bot.on('chat', (username, message) => {
      emitToBot(this.id, 'bot:chat', { botId: this.id, username, message });
    });
  }

  private emitStatus(): void {
    emitToBot(this.id, 'bot:status', { botId: this.id, ...this.getStatus() });
  }

  private async updateDatabase(data: any): Promise<void> {
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
      this.bot.quit();
      this.bot = null;
    }
    this.status = { connected: false, spawned: false };
    await this.updateDatabase({ isOnline: false, lastSeen: new Date() });
    this.emitStatus();
  }

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

  findChestsInRadius(centerX: number, centerY: number, centerZ: number, radius: number): any[] {
    if (!this.bot) return [];

    const chestId = this.bot.registry.blocksByName.chest?.id;
    const trappedChestId = this.bot.registry.blocksByName.trapped_chest?.id;
    const barrelId = this.bot.registry.blocksByName.barrel?.id;

    const blockIds = [chestId, trappedChestId, barrelId].filter(Boolean) as number[];

    const positions = this.bot.findBlocks({
      matching: blockIds,
      maxDistance: radius,
      count: 1000,
      point: new Vec3(centerX, centerY, centerZ),
    });

    // Track positions we've already included (to handle double chests)
    const processedPositions = new Set<string>();
    const results: any[] = [];

    for (const pos of positions) {
      const posKey = `${pos.x},${pos.y},${pos.z}`;
      if (processedPositions.has(posKey)) continue;

      const block = this.bot!.blockAt(pos);
      if (!block) continue;

      const blockName = block.name;
      let isDoubleChest = false;
      let otherHalfPos: Vec3 | null = null;

      // Check if this is a chest (not barrel) and look for connected half
      if (blockName === 'chest' || blockName === 'trapped_chest') {
        // Check the chest's "type" property from block state to detect double chests
        // type can be 'single', 'left', or 'right'
        const chestType = block.getProperties?.()?.type as string | undefined;
        const facing = block.getProperties?.()?.facing as string | undefined;

        if (chestType && chestType !== 'single' && facing) {
          isDoubleChest = true;
          // Calculate the position of the other half based on facing and type
          // When facing north/south, left/right are on x-axis
          // When facing east/west, left/right are on z-axis
          let offsetX = 0, offsetZ = 0;

          if (facing === 'north') {
            offsetX = chestType === 'left' ? 1 : -1;
          } else if (facing === 'south') {
            offsetX = chestType === 'left' ? -1 : 1;
          } else if (facing === 'east') {
            offsetZ = chestType === 'left' ? 1 : -1;
          } else if (facing === 'west') {
            offsetZ = chestType === 'left' ? -1 : 1;
          }

          otherHalfPos = new Vec3(pos.x + offsetX, pos.y, pos.z + offsetZ);
        }
      }

      // Mark this position as processed
      processedPositions.add(posKey);

      // If double chest, also mark the other half as processed
      if (otherHalfPos) {
        processedPositions.add(`${otherHalfPos.x},${otherHalfPos.y},${otherHalfPos.z}`);
      }

      results.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        type: isDoubleChest ? 'double_chest' : blockName,
      });
    }

    return results;
  }

  async openAndReadChest(x: number, y: number, z: number): Promise<any[]> {
    if (!this.bot) throw new Error('Bot not connected');

    const block = this.bot.blockAt(new Vec3(x, y, z));
    if (!block) throw new Error('Block not found');

    // Move adjacent to the chest first
    await this.moveToBlock(x, y, z);

    // Wait a bit before opening
    await this.sleep(200);

    const chest = await this.bot.openContainer(block);
    
    const items = chest.containerItems().map((item) => ({
      slot: item.slot,
      itemId: item.name,
      itemName: item.displayName,
      count: item.count,
      nbt: item.nbt || null,
    }));

    // Wait a bit before closing
    await this.sleep(100);
    chest.close();

    return items;
  }

  async indexStorage(storageId: string): Promise<void> {
    if (this.isIndexing) {
      throw new Error('Already indexing');
    }

    const storage = await prisma.storageSystem.findUnique({
      where: { id: storageId },
    });

    if (!storage) {
      throw new Error('Storage system not found');
    }

    this.isIndexing = true;
    this.status.currentAction = 'Indexing storage...';
    this.emitStatus();

    try {
      // Move to storage center
      emitToBot(this.id, 'storage:indexProgress', {
        botId: this.id,
        storageId,
        progress: 0,
        status: 'Moving to storage area',
      });

      await this.moveTo(storage.centerX, storage.centerY, storage.centerZ);

      // Find all chests
      emitToBot(this.id, 'storage:indexProgress', {
        botId: this.id,
        storageId,
        progress: 5,
        status: 'Scanning for chests',
      });

      const chests = this.findChestsInRadius(
        storage.centerX,
        storage.centerY,
        storage.centerZ,
        storage.radius
      );

      console.log(`Found ${chests.length} chests in storage ${storageId}`);

      // Clear existing chest data
      await prisma.chest.deleteMany({
        where: { storageSystemId: storageId },
      });

      // Index each chest
      for (let i = 0; i < chests.length; i++) {
        const chest = chests[i];
        const progress = Math.floor(5 + (i / chests.length) * 90);

        emitToBot(this.id, 'storage:indexProgress', {
          botId: this.id,
          storageId,
          progress,
          status: `Indexing chest ${i + 1}/${chests.length}`,
          chestPosition: { x: chest.x, y: chest.y, z: chest.z },
        });

        try {
          const items = await this.openAndReadChest(chest.x, chest.y, chest.z);

          // Save to database
          const dbChest = await prisma.chest.create({
            data: {
              storageSystemId: storageId,
              x: chest.x,
              y: chest.y,
              z: chest.z,
              chestType: chest.type,
              isDoubleChest: chest.type === 'double_chest',
              lastOpened: new Date(),
              items: {
                create: items.map((item) => ({
                  slot: item.slot,
                  itemId: item.itemId,
                  itemName: item.itemName,
                  count: item.count,
                  nbt: item.nbt,
                })),
              },
            },
          });

          emitToBot(this.id, 'storage:chestIndexed', {
            botId: this.id,
            storageId,
            chest: dbChest,
            items,
          });

          // Emit stats updated event for live updates
          emitToBot(this.id, 'storage:statsUpdated', { botId: this.id, storageId });

          // Wait between chests to avoid spam
          await this.sleep(500);
        } catch (error) {
          console.error(`Failed to index chest at ${chest.x}, ${chest.y}, ${chest.z}:`, error);
          // Continue with next chest
        }
      }

      // Update storage system
      await prisma.storageSystem.update({
        where: { id: storageId },
        data: {
          isIndexed: true,
          lastIndexed: new Date(),
          indexProgress: 100,
        },
      });

      emitToBot(this.id, 'storage:indexProgress', {
        botId: this.id,
        storageId,
        progress: 100,
        status: 'Indexing complete',
      });

      emitToBot(this.id, 'storage:indexComplete', {
        botId: this.id,
        storageId,
        totalChests: chests.length,
      });

      // Final stats update
      emitToBot(this.id, 'storage:statsUpdated', { botId: this.id, storageId });
    } catch (error) {
      console.error('Indexing failed:', error);
      emitToBot(this.id, 'storage:indexError', {
        botId: this.id,
        storageId,
        error: (error as Error).message,
      });
      throw error;
    } finally {
      this.isIndexing = false;
      this.status.currentAction = undefined;
      this.emitStatus();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  setMicrosoftEmail(email: string): void {
    this.microsoftEmail = email;
  }

  getMineflayerBot(): Bot | null {
    return this.bot;
  }
}

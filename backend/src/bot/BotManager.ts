import { BaseBotInstance, BotConnectionOptions, BotStatus } from './BaseBotInstance.js';
import { botTypeRegistry } from './BotTypeRegistry.js';
import { prisma } from '../lib/prisma.js';
import { emitToBot, emitToUser } from '../lib/socket.js';
import fs from 'fs';
// @ts-ignore - prismarine-auth doesn't have types in package
import { Authflow, Titles } from 'prismarine-auth';

// Import all bot types to ensure they're registered
import './types/index.js';

// Re-export for backwards compatibility
export { StorageBotInstance } from './types/storage/index.js';

interface AuthSession {
  botId: string;
  userId: string;
  status: 'pending' | 'authenticating' | 'authenticated' | 'failed';
  code?: string;
  verificationUri?: string;
  expiresAt?: Date;
  error?: string;
  authPromise?: Promise<any>;
}

export class BotManager {
  private static instance: BotManager;
  private bots: Map<string, BaseBotInstance> = new Map();
  private authSessions: Map<string, AuthSession> = new Map();
  private taskQueues: Map<string, boolean> = new Map();

  private constructor() {}

  static getInstance(): BotManager {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager();
    }
    return BotManager.instance;
  }

  /**
   * Get or create a bot instance based on its type from the database
   */
  async getOrCreateBot(botId: string, userId: string): Promise<BaseBotInstance> {
    let bot = this.bots.get(botId);

    if (!bot) {
      // Fetch bot from database to get its type
      const dbBot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!dbBot) {
        throw new Error('Bot not found in database');
      }

      // Use botType from database, default to 'storage' for backwards compatibility
      const botType = dbBot.botType || 'storage';

      if (!botTypeRegistry.has(botType)) {
        throw new Error(`Unknown bot type: ${botType}`);
      }

      bot = botTypeRegistry.createInstance(botType, botId, userId);
      await bot.loadFromDatabase();
      this.bots.set(botId, bot);
    }

    return bot;
  }

  /**
   * Get all registered bot types
   */
  getBotTypes() {
    return botTypeRegistry.getAllTypes();
  }

  /**
   * Get an existing bot instance (does not create one if not found)
   */
  getBot(botId: string): BaseBotInstance | undefined {
    return this.bots.get(botId);
  }

  getBotStatus(botId: string): BotStatus {
    const bot = this.bots.get(botId);
    if (!bot) {
      return { connected: false, spawned: false };
    }
    return bot.getStatus();
  }

  async startAuthentication(botId: string, userId: string): Promise<{ status: string; message: string }> {
    const dbBot = await prisma.bot.findUnique({
      where: { id: botId },
    });

    if (!dbBot) {
      throw new Error('Bot not found');
    }

    if (!dbBot.microsoftEmail) {
      throw new Error('Microsoft email not configured');
    }

    // Create auth cache directory
    const sanitizedBotId = botId.replace(/[^a-zA-Z0-9-]/g, '');
    if (sanitizedBotId !== botId) {
      throw new Error('Invalid bot ID format');
    }
    const cacheDir = `./auth_cache/${sanitizedBotId}`;
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const existingSession = this.authSessions.get(botId);
    if (existingSession?.status === 'authenticating') {
      return {
        status: 'authenticating',
        message: 'Authentication already in progress',
      };
    }

    const session: AuthSession = {
      botId,
      userId,
      status: 'authenticating',
    };
    this.authSessions.set(botId, session);

    const onMsaCode = (data: { user_code: string; verification_uri: string; message: string }) => {
      console.log(`[Bot ${botId}] MSA Code: ${data.user_code} - Visit: ${data.verification_uri}`);

      session.code = data.user_code;
      session.verificationUri = data.verification_uri;

      emitToBot(botId, 'bot:msaCode', {
        botId,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        message: data.message,
      });
    };

    const authflow = new Authflow(
      dbBot.microsoftEmail,
      cacheDir,
      { authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo', flow: 'live' },
      onMsaCode
    );

    session.authPromise = authflow
      .getMinecraftJavaToken({ fetchProfile: true })
      .then(async (result: any) => {
        console.log(`[Bot ${botId}] Authentication successful: ${result.profile?.name}`);
        session.status = 'authenticated';

        await prisma.bot.update({
          where: { id: botId },
          data: { isAuthenticated: true },
        });

        emitToBot(botId, 'bot:authComplete', {
          botId,
          success: true,
          profile: result.profile,
        });

        return result;
      })
      .catch((error: Error) => {
        console.error(`[Bot ${botId}] Authentication failed:`, error);
        session.status = 'failed';
        session.error = error.message;

        emitToBot(botId, 'bot:authComplete', {
          botId,
          success: false,
          error: error.message,
        });

        throw error;
      });

    return {
      status: 'authenticating',
      message: 'Authentication started. Please complete the sign-in process.',
    };
  }

  getAuthStatus(botId: string): AuthSession | null {
    return this.authSessions.get(botId) || null;
  }

  async connectBot(botId: string, options: BotConnectionOptions): Promise<void> {
    const dbBot = await prisma.bot.findUnique({
      where: { id: botId },
    });

    if (!dbBot) {
      throw new Error('Bot not found');
    }

    if (dbBot.useOfflineAccount) {
      const bot = await this.getOrCreateBot(botId, dbBot.userId);
      bot.setOfflineMode(dbBot.offlineUsername || 'Bot');

      try {
        emitToBot(botId, 'bot:connecting', { botId, host: options.host, port: options.port });
        await bot.connect(options);

        await prisma.bot.update({
          where: { id: botId },
          data: { isAuthenticated: true, isOnline: true, lastSeen: new Date() },
        });

        emitToBot(botId, 'bot:connected', { botId, ...bot.getStatus() });
      } catch (error) {
        emitToBot(botId, 'bot:connectionFailed', { botId, error: (error as Error).message });
        throw error;
      }
    } else {
      if (!dbBot.microsoftEmail) {
        throw new Error('Bot not authenticated. Please complete Microsoft authentication first.');
      }

      const bot = await this.getOrCreateBot(botId, dbBot.userId);
      bot.setMicrosoftEmail(dbBot.microsoftEmail);

      try {
        emitToBot(botId, 'bot:connecting', { botId, host: options.host, port: options.port });
        await bot.connect(options);

        const session = this.authSessions.get(botId);
        if (session) {
          session.status = 'authenticated';
        }

        await prisma.bot.update({
          where: { id: botId },
          data: { isAuthenticated: true, isOnline: true, lastSeen: new Date() },
        });

        emitToBot(botId, 'bot:connected', { botId, ...bot.getStatus() });
      } catch (error) {
        emitToBot(botId, 'bot:connectionFailed', { botId, error: (error as Error).message });
        throw error;
      }
    }
  }

  async disconnectBot(botId: string): Promise<void> {
    const bot = this.bots.get(botId);
    if (bot) {
      await bot.disconnect();
      this.bots.delete(botId);
    }
  }

  async moveBotTo(botId: string, x: number, y: number, z: number): Promise<void> {
    const bot = this.bots.get(botId);
    if (!bot) {
      throw new Error('Bot not found or not connected');
    }
    await bot.moveTo(x, y, z);
  }

  // ============ STORAGE BOT SPECIFIC METHODS ============
  // These could be moved to a StorageBotManager in the future,
  // but keeping here for backwards compatibility

  async startIndexing(botId: string, storageId: string): Promise<void> {
    const bot = this.bots.get(botId);
    if (!bot) {
      throw new Error('Bot not found or not connected');
    }

    // Type guard - check if bot has indexStorage method
    if (!('indexStorage' in bot)) {
      throw new Error('This bot type does not support storage indexing');
    }

    const storageBot = bot as any;

    storageBot
      .indexStorage(storageId)
      .then(() => {
        console.log(`[BotManager] Indexing complete for bot ${botId}, processing queued tasks`);
        return this.processTaskQueue(botId);
      })
      .catch((error: Error) => {
        console.error('Indexing error:', error);
        emitToBot(botId, 'storage:indexError', {
          botId,
          storageId,
          error: error.message,
        });
      });
  }

  stopIndexing(botId: string): boolean {
    const bot = this.bots.get(botId);
    if (!bot) {
      return false;
    }

    if (!('stopIndexing' in bot)) {
      return false;
    }

    return (bot as any).stopIndexing();
  }

  // ============ TASK QUEUE MANAGEMENT ============

  async processTaskQueue(botId: string): Promise<void> {
    if (this.taskQueues.get(botId)) {
      return;
    }

    const bot = this.bots.get(botId);
    if (!bot || !bot.getStatus().connected) {
      console.log(`[TaskQueue] Bot ${botId} not connected, skipping queue processing`);
      return;
    }

    const status = bot.getStatus();
    if (status.isIndexing) {
      console.log(`[TaskQueue] Bot ${botId} is indexing, tasks will be processed after indexing completes`);
      return;
    }

    this.taskQueues.set(botId, true);

    try {
      while (true) {
        const task = await prisma.requestTask.findFirst({
          where: {
            botId,
            status: 'PENDING',
          },
          orderBy: { queuePosition: 'asc' },
          include: { items: true },
        });

        if (!task) {
          console.log(`[TaskQueue] No pending tasks for bot ${botId}`);
          break;
        }

        console.log(`[TaskQueue] Processing task ${task.id} for bot ${botId}`);

        await prisma.requestTask.update({
          where: { id: task.id },
          data: { status: 'IN_PROGRESS', currentStep: 'Starting...' },
        });

        emitToBot(botId, 'task:updated', {
          task: { ...task, status: 'IN_PROGRESS', currentStep: 'Starting...' },
        });

        try {
          await bot.executeTask(task);

          await prisma.requestTask.update({
            where: { id: task.id },
            data: {
              status: 'COMPLETED',
              currentStep: 'Completed',
              completedAt: new Date(),
            },
          });

          const completedTask = await prisma.requestTask.findUnique({
            where: { id: task.id },
            include: { items: true },
          });

          emitToBot(botId, 'task:completed', { task: completedTask });
        } catch (error) {
          console.error(`[TaskQueue] Task ${task.id} failed:`, error);

          await prisma.requestTask.update({
            where: { id: task.id },
            data: {
              status: 'FAILED',
              errorMessage: (error as Error).message,
              completedAt: new Date(),
            },
          });

          const failedTask = await prisma.requestTask.findUnique({
            where: { id: task.id },
            include: { items: true },
          });

          emitToBot(botId, 'task:failed', { task: failedTask, error: (error as Error).message });
        }
      }
    } finally {
      this.taskQueues.set(botId, false);
    }
  }

  cancelTask(botId: string, taskId: string): void {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.cancelCurrentTask(taskId);
    }
  }

  async shutdown(): Promise<void> {
    const promises = Array.from(this.bots.values()).map((bot) => bot.disconnect());
    await Promise.all(promises);
    this.bots.clear();
  }
}

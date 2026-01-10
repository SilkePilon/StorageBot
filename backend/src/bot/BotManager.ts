import { BotInstance, BotConnectionOptions, BotStatus } from './BotInstance.js';
import { prisma } from '../lib/prisma.js';
import { emitToBot, emitToUser } from '../lib/socket.js';
import mineflayer from 'mineflayer';
import fs from 'fs';
import path from 'path';
// @ts-ignore - prismarine-auth doesn't have types in package
import { Authflow, Titles } from 'prismarine-auth';

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
  private bots: Map<string, BotInstance> = new Map();
  private authSessions: Map<string, AuthSession> = new Map();

  private constructor() {}

  static getInstance(): BotManager {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager();
    }
    return BotManager.instance;
  }

  async getOrCreateBot(botId: string, userId: string): Promise<BotInstance> {
    let bot = this.bots.get(botId);
    
    if (!bot) {
      bot = new BotInstance(botId, userId);
      await bot.loadFromDatabase();
      this.bots.set(botId, bot);
    }

    return bot;
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

    // Create auth cache directory - sanitize botId to prevent path traversal
    const sanitizedBotId = botId.replace(/[^a-zA-Z0-9-]/g, '');
    if (sanitizedBotId !== botId) {
      throw new Error('Invalid bot ID format');
    }
    const cacheDir = `./auth_cache/${sanitizedBotId}`;
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Check if already authenticating
    const existingSession = this.authSessions.get(botId);
    if (existingSession?.status === 'authenticating') {
      return {
        status: 'authenticating',
        message: 'Authentication already in progress',
      };
    }

    // Initialize auth session
    const session: AuthSession = {
      botId,
      userId,
      status: 'authenticating',
    };
    this.authSessions.set(botId, session);

    // Use prismarine-auth directly for authentication
    const onMsaCode = (data: { user_code: string; verification_uri: string; message: string }) => {
      console.log(`[Bot ${botId}] MSA Code: ${data.user_code} - Visit: ${data.verification_uri}`);
      
      session.code = data.user_code;
      session.verificationUri = data.verification_uri;
      
      // Emit to the user via WebSocket
      emitToBot(botId, 'bot:msaCode', {
        botId,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        message: data.message,
      });
    };

    // Start authentication in background
    const authflow = new Authflow(
      dbBot.microsoftEmail,
      cacheDir,
      { authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo', flow: 'live' },
      onMsaCode
    );

    // Start the auth process - this will trigger the device code callback if needed
    session.authPromise = authflow.getMinecraftJavaToken({ fetchProfile: true })
      .then(async (result: any) => {
        console.log(`[Bot ${botId}] Authentication successful: ${result.profile?.name}`);
        session.status = 'authenticated';
        
        // Update database
        await prisma.bot.update({
          where: { id: botId },
          data: { isAuthenticated: true },
        });

        // Notify frontend
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

    // Check if using offline mode
    if (dbBot.useOfflineAccount) {
      // Offline mode - use cracked/offline account
      const bot = await this.getOrCreateBot(botId, dbBot.userId);
      bot.setOfflineMode(dbBot.offlineUsername || 'StorageBot');

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
      // Online mode - require Microsoft auth
      if (!dbBot.microsoftEmail) {
        throw new Error('Bot not authenticated. Please complete Microsoft authentication first.');
      }

      const bot = await this.getOrCreateBot(botId, dbBot.userId);
      bot.setMicrosoftEmail(dbBot.microsoftEmail);

      try {
        emitToBot(botId, 'bot:connecting', { botId, host: options.host, port: options.port });
        await bot.connect(options);
        
        // Update auth status
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

  async startIndexing(botId: string, storageId: string): Promise<void> {
    const bot = this.bots.get(botId);
    if (!bot) {
      throw new Error('Bot not found or not connected');
    }
    
    // Run indexing in background
    bot.indexStorage(storageId)
      .then(() => {
        // After indexing completes, process any queued tasks
        console.log(`[BotManager] Indexing complete for bot ${botId}, processing queued tasks`);
        this.processTaskQueue(botId);
      })
      .catch((error) => {
        console.error('Indexing error:', error);
        emitToBot(botId, 'storage:indexError', {
          botId,
          storageId,
          error: (error as Error).message,
        });
      });
  }

  stopIndexing(botId: string): boolean {
    const bot = this.bots.get(botId);
    if (!bot) {
      return false;
    }
    return bot.stopIndexing();
  }

  // ============ TASK QUEUE MANAGEMENT ============

  private taskQueues: Map<string, boolean> = new Map(); // botId -> isProcessing

  async processTaskQueue(botId: string): Promise<void> {
    // Prevent concurrent processing for the same bot
    if (this.taskQueues.get(botId)) {
      return;
    }

    const bot = this.bots.get(botId);
    if (!bot || !bot.getStatus().connected) {
      console.log(`[TaskQueue] Bot ${botId} not connected, skipping queue processing`);
      return;
    }

    // If bot is currently indexing, don't start tasks - they will be processed after indexing completes
    if (bot.getStatus().isIndexing) {
      console.log(`[TaskQueue] Bot ${botId} is indexing, tasks will be processed after indexing completes`);
      return;
    }

    this.taskQueues.set(botId, true);

    try {
      while (true) {
        // Get the next pending task
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

        // Update task to in-progress
        await prisma.requestTask.update({
          where: { id: task.id },
          data: { status: 'IN_PROGRESS', currentStep: 'Starting...' },
        });

        emitToBot(botId, 'task:updated', {
          task: { ...task, status: 'IN_PROGRESS', currentStep: 'Starting...' },
        });

        try {
          await bot.executeTask(task);

          // Mark as completed
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

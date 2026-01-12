import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { BotManager } from '../bot/BotManager.js';
import { botTypeRegistry } from '../bot/BotTypeRegistry.js';

// Import bot types to ensure they're registered
import '../bot/types/index.js';

const router = Router();

// Get supported Minecraft versions (public endpoint)
router.get('/versions', (req, res) => {
  try {
    // Get tested versions from mineflayer
    const mineflayer = require('mineflayer');
    const versions = mineflayer.testedVersions || [];
    res.json({ versions });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

// Get available bot types (public endpoint)
router.get('/types', (req, res) => {
  try {
    const types = botTypeRegistry.getAllTypes();
    res.json({ types });
  } catch (error) {
    console.error('Get bot types error:', error);
    res.status(500).json({ error: 'Failed to get bot types' });
  }
});

// Get all public bots (public endpoint, but requires auth for user info)
router.get('/public', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const publicBots = await prisma.bot.findMany({
      where: { 
        isPublic: true,
        // Exclude user's own bots from public list
        NOT: { userId: req.userId },
      },
      select: {
        id: true,
        name: true,
        isPublic: true,
        isOnline: true,
        serverHost: true,
        serverPort: true,
        serverVersion: true,
        lastSeen: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: { storageSystems: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add runtime status
    const botsWithStatus = publicBots.map((b) => ({
      ...b,
      runtimeStatus: BotManager.getInstance().getBotStatus(b.id),
      isOwner: false,
    }));

    res.json(botsWithStatus);
  } catch (error) {
    console.error('List public bots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// All routes below require authentication
router.use(authMiddleware);

const createBotSchema = z.object({
  name: z.string().min(1).max(50),
  botType: z.string().min(1).default('storage'),
  useOfflineAccount: z.boolean().optional().default(false),
  offlineUsername: z.string().min(1).max(16).optional(),
});

const updateBotSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  serverHost: z.string().optional(),
  serverPort: z.number().int().min(1).max(65535).optional(),
  serverVersion: z.string().nullable().optional(),
  microsoftEmail: z.string().email().optional(),
});

const connectBotSchema = z.object({
  serverHost: z.string().min(1),
  serverPort: z.number().int().min(1).max(65535).default(25565),
  serverVersion: z.string().nullable().optional(),
});

// List user's bots
router.get('/', async (req: AuthRequest, res) => {
  try {
    const bots = await prisma.bot.findMany({
      where: { userId: req.userId },
      include: {
        _count: {
          select: { storageSystems: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add runtime status and isOwner flag
    const botsWithStatus = bots.map((b: typeof bots[number]) => ({
      ...b,
      runtimeStatus: BotManager.getInstance().getBotStatus(b.id),
      isOwner: true,
    }));

    res.json(botsWithStatus);
  } catch (error) {
    console.error('List bots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new bot
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, botType, useOfflineAccount, offlineUsername } = createBotSchema.parse(req.body);

    // Validate bot type exists
    if (!botTypeRegistry.has(botType)) {
      res.status(400).json({ error: `Invalid bot type: ${botType}` });
      return;
    }

    const bot = await prisma.bot.create({
      data: {
        name,
        botType,
        userId: req.userId!,
        useOfflineAccount: useOfflineAccount || false,
        offlineUsername: useOfflineAccount ? (offlineUsername || 'StorageBot') : null,
        // If offline mode, mark as authenticated since no MSA needed
        isAuthenticated: useOfflineAccount || false,
      },
    });

    res.status(201).json(bot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bot details
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: {
        storageSystems: {
          include: {
            _count: {
              select: { chests: true },
            },
          },
        },
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    res.json({
      ...bot,
      runtimeStatus: BotManager.getInstance().getBotStatus(bot.id),
    });
  } catch (error) {
    console.error('Get bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bot
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const data = updateBotSchema.parse(req.body);

    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const updatedBot = await prisma.bot.update({
      where: { id: req.params.id },
      data,
    });

    res.json(updatedBot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Update bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle bot visibility (public/private)
router.patch('/:id/visibility', async (req: AuthRequest, res) => {
  try {
    const { isPublic } = z.object({ isPublic: z.boolean() }).parse(req.body);

    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const updatedBot = await prisma.bot.update({
      where: { id: req.params.id },
      data: { isPublic },
    });

    res.json(updatedBot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Update visibility error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete bot
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    // Disconnect bot if running
    await BotManager.getInstance().disconnectBot(bot.id);

    await prisma.bot.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start MSA authentication
router.post('/:id/auth/start', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const result = await BotManager.getInstance().startAuthentication(bot.id, req.userId!);

    res.json(result);
  } catch (error) {
    console.error('Start auth error:', error);
    res.status(500).json({ error: 'Failed to start authentication' });
  }
});

// Get auth status
router.get('/:id/auth/status', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const status = BotManager.getInstance().getAuthStatus(bot.id);

    res.json(status);
  } catch (error) {
    console.error('Get auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Force re-authenticate (clears cache and starts fresh auth)
router.post('/:id/auth/reauth', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    if (bot.useOfflineAccount) {
      res.status(400).json({ error: 'Offline accounts do not require re-authentication' });
      return;
    }

    if (!bot.microsoftEmail) {
      res.status(400).json({ error: 'Microsoft email not configured' });
      return;
    }

    const result = await BotManager.getInstance().forceReauthenticate(bot.id, req.userId!);

    res.json(result);
  } catch (error) {
    console.error('Re-auth error:', error);
    res.status(500).json({ error: 'Failed to start re-authentication' });
  }
});

// Connect bot to server
router.post('/:id/connect', async (req: AuthRequest, res) => {
  try {
    const { serverHost, serverPort, serverVersion } = connectBotSchema.parse(req.body);

    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    // Update bot with server info
    await prisma.bot.update({
      where: { id: bot.id },
      data: {
        serverHost,
        serverPort,
        serverVersion,
      },
    });

    // Connect bot
    await BotManager.getInstance().connectBot(bot.id, {
      host: serverHost,
      port: serverPort,
      version: serverVersion || undefined,
    });

    res.json({ status: 'connecting' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Connect bot error:', error);
    res.status(500).json({ error: 'Failed to connect bot' });
  }
});

// Disconnect bot
router.post('/:id/disconnect', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    await BotManager.getInstance().disconnectBot(bot.id);

    res.json({ status: 'disconnected' });
  } catch (error) {
    console.error('Disconnect bot error:', error);
    res.status(500).json({ error: 'Failed to disconnect bot' });
  }
});

// Get bot status
router.get('/:id/status', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const status = BotManager.getInstance().getBotStatus(bot.id);

    res.json(status);
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Move bot to coordinates
const gotoSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

router.post('/:id/goto', async (req: AuthRequest, res) => {
  try {
    const { x, y, z: zCoord } = gotoSchema.parse(req.body);

    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    await BotManager.getInstance().moveBotTo(bot.id, x, y, zCoord);

    res.json({ status: 'moving' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Move bot error:', error);
    res.status(500).json({ error: 'Failed to move bot' });
  }
});

export default router;

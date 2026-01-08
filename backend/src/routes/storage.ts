import { Router } from 'express';
import { z } from 'zod';
import minecraftData from 'minecraft-data';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { BotManager } from '../bot/BotManager.js';

const router = Router();

router.use(authMiddleware);

// Helper to check if user can access a bot (owner or public)
async function canAccessBot(botId: string, userId: string): Promise<{ canAccess: boolean; isOwner: boolean; bot: any | null }> {
  const bot = await prisma.bot.findUnique({
    where: { id: botId },
  });
  
  if (!bot) {
    return { canAccess: false, isOwner: false, bot: null };
  }
  
  const isOwner = bot.userId === userId;
  const canAccess = isOwner || bot.isPublic;
  
  return { canAccess, isOwner, bot };
}

const createStorageSchema = z.object({
  name: z.string().min(1).max(50),
  botId: z.string().uuid(),
  centerX: z.number().int(),
  centerY: z.number().int(),
  centerZ: z.number().int(),
  radius: z.number().int().min(1).max(64).default(32),
});

const updateStorageSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  centerX: z.number().int().optional(),
  centerY: z.number().int().optional(),
  centerZ: z.number().int().optional(),
  radius: z.number().int().min(1).max(64).optional(),
});

// List storage systems for a bot
router.get('/bot/:botId', async (req: AuthRequest, res) => {
  try {
    // Check if user can access this bot (owner or public)
    const { canAccess, isOwner } = await canAccessBot(req.params.botId, req.userId!);

    if (!canAccess) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const storageSystems = await prisma.storageSystem.findMany({
      where: { botId: req.params.botId },
      include: {
        _count: {
          select: { chests: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(storageSystems);
  } catch (error) {
    console.error('List storage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create storage system
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createStorageSchema.parse(req.body);

    // Verify bot belongs to user
    const bot = await prisma.bot.findFirst({
      where: {
        id: data.botId,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const storage = await prisma.storageSystem.create({
      data,
    });

    res.status(201).json(storage);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Create storage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get storage system details
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.id },
      include: {
        bot: {
          select: { userId: true, isPublic: true },
        },
        chests: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!storage) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    // Check if user can access (owner or public bot)
    const isOwner = storage.bot.userId === req.userId;
    if (!isOwner && !storage.bot.isPublic) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    res.json(storage);
  } catch (error) {
    console.error('Get storage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update storage system
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const data = updateStorageSchema.parse(req.body);

    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.id },
      include: {
        bot: {
          select: { userId: true },
        },
      },
    });

    if (!storage || storage.bot.userId !== req.userId) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    const updatedStorage = await prisma.storageSystem.update({
      where: { id: req.params.id },
      data,
    });

    res.json(updatedStorage);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Update storage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete storage system
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.id },
      include: {
        bot: {
          select: { userId: true },
        },
      },
    });

    if (!storage || storage.bot.userId !== req.userId) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    await prisma.storageSystem.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete storage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start indexing storage
router.post('/:id/index', async (req: AuthRequest, res) => {
  try {
    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.id },
      include: {
        bot: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!storage || storage.bot.userId !== req.userId) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    // Start indexing via bot manager
    await BotManager.getInstance().startIndexing(storage.bot.id, storage.id);

    res.json({ status: 'indexing_started' });
  } catch (error) {
    console.error('Start indexing error:', error);
    res.status(500).json({ error: 'Failed to start indexing' });
  }
});

// Get items in storage (with search)
router.get('/:id/items', async (req: AuthRequest, res) => {
  try {
    const { search, page = '1', limit = '100' } = req.query;

    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.id },
      include: {
        bot: {
          select: { userId: true, isPublic: true },
        },
      },
    });

    if (!storage) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    // Check if user can access (owner or public bot)
    const isOwner = storage.bot.userId === req.userId;
    if (!isOwner && !storage.bot.isPublic) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit as string, 10) || 100));

    // Build search conditions - search both chest items AND shulker contents
    const searchStr = search ? (search as string).toLowerCase() : null;
    
    let where: any = {
      chest: {
        storageSystemId: req.params.id,
      },
    };

    if (searchStr) {
      // Search in item names OR in shulker contents
      where = {
        chest: {
          storageSystemId: req.params.id,
        },
        OR: [
          {
            itemName: {
              contains: searchStr,
              mode: 'insensitive',
            },
          },
          {
            shulkerContents: {
              some: {
                itemName: {
                  contains: searchStr,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      };
    }

    // Fetch ALL items first (no pagination at DB level) so we can aggregate properly
    // Pagination is applied AFTER aggregation
    const items = await prisma.chestItem.findMany({
      where,
      include: {
        chest: {
          select: {
            x: true,
            y: true,
            z: true,
            chestType: true,
            lastOpened: true,
          },
        },
        shulkerContents: true,
      },
      orderBy: { itemName: 'asc' },
    });

    // Aggregate items by name for summary
    // Items can come from chests directly OR from inside shulker boxes
    interface ItemLocation {
      x: number;
      y: number;
      z: number;
      count: number;
      lastOpened: Date | null;
      // For items inside shulkers
      fromShulker?: boolean;
      shulkerChestItemId?: string;  // ChestItem.id of the shulker
      shulkerSlotInChest?: number;  // Slot of shulker in the chest
      slotInShulker?: number;       // Slot of item inside the shulker
      shulkerContentId?: string;    // ShulkerContent.id
    }

    interface AggregatedItem {
      itemId: string;
      itemName: string;
      totalCount: number;
      isShulkerBox: boolean;
      hasContents: boolean;
      shulkerContents?: { slot: number; itemId: string; itemName: string; count: number }[];
      shulkerId?: string; // unique ID for filled shulkers
      locations: ItemLocation[];
      hasShulkerSources?: boolean; // True if some of this item comes from inside shulkers
    }
    
    const aggregated: AggregatedItem[] = [];
    
    for (const item of items) {
      const isFilledShulker = item.isShulkerBox && item.shulkerContents && item.shulkerContents.length > 0;
      
      if (isFilledShulker) {
        // Filled shulker boxes are always shown individually
        // Include source info in shulkerContents so frontend can select items from inside
        aggregated.push({
          itemId: item.itemId,
          itemName: item.itemName,
          totalCount: item.count,
          isShulkerBox: true,
          hasContents: true,
          shulkerId: item.id,
          shulkerContents: item.shulkerContents.map((c) => ({
            id: c.id,  // ShulkerContent.id for selection
            slot: c.slot,
            itemId: c.itemId,
            itemName: c.itemName,
            count: c.count,
            // Source info for task creation
            shulkerChestItemId: item.id,
            shulkerSlotInChest: item.slot,
            chestX: item.chest.x,
            chestY: item.chest.y,
            chestZ: item.chest.z,
          })),
          locations: [{
            x: item.chest.x,
            y: item.chest.y,
            z: item.chest.z,
            count: item.count,
            lastOpened: item.chest.lastOpened,
          }],
        });
        // Items inside shulkers are NOT added to main list - only selectable from shulker view
      } else {
        // Regular items and empty shulkers can be aggregated
        const existing = aggregated.find(
          (i) => i.itemId === item.itemId && !i.hasContents
        );
        
        if (existing) {
          existing.totalCount += item.count;
          existing.locations.push({
            x: item.chest.x,
            y: item.chest.y,
            z: item.chest.z,
            count: item.count,
            lastOpened: item.chest.lastOpened,
          });
        } else {
          aggregated.push({
            itemId: item.itemId,
            itemName: item.itemName,
            totalCount: item.count,
            isShulkerBox: item.isShulkerBox,
            hasContents: false,
            locations: [{
              x: item.chest.x,
              y: item.chest.y,
              z: item.chest.z,
              count: item.count,
              lastOpened: item.chest.lastOpened,
            }],
          });
        }
      }
    }

    // Apply pagination AFTER aggregation
    const totalAggregated = aggregated.length;
    const skip = (pageNum - 1) * limitNum;
    const paginatedItems = aggregated.slice(skip, skip + limitNum);

    res.json({
      items: paginatedItems,
      lastIndexed: storage.lastIndexed,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalAggregated,
        totalPages: Math.ceil(totalAggregated / limitNum),
      },
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all chests in storage
router.get('/:id/chests', async (req: AuthRequest, res) => {
  try {
    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.id },
      include: {
        bot: {
          select: { userId: true, isPublic: true },
        },
      },
    });

    if (!storage) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    // Check if user can access (owner or public bot)
    const isOwner = storage.bot.userId === req.userId;
    if (!isOwner && !storage.bot.isPublic) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    const chests = await prisma.chest.findMany({
      where: { storageSystemId: req.params.id },
      include: {
        items: true,
        _count: {
          select: { items: true },
        },
      },
      orderBy: [{ y: 'asc' }, { x: 'asc' }, { z: 'asc' }],
    });

    res.json(chests);
  } catch (error) {
    console.error('Get chests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get storage statistics
router.get('/:id/stats', async (req: AuthRequest, res) => {
  try {
    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.id },
      include: {
        bot: {
          select: { userId: true, serverVersion: true, isPublic: true },
        },
      },
    });

    if (!storage) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    // Check if user can access (owner or public bot)
    const isOwner = storage.bot.userId === req.userId;
    if (!isOwner && !storage.bot.isPublic) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    // Get minecraft-data for the server version to check if items are blocks
    const version = storage.bot.serverVersion || '1.21.4';
    const mcData = minecraftData(version);

    // Get chest counts by type
    const chests = await prisma.chest.findMany({
      where: { storageSystemId: req.params.id },
      select: {
        isDoubleChest: true,
        chestType: true,
        items: {
          select: {
            count: true,
            itemId: true,
          },
        },
      },
    });

    // Calculate slot capacity
    // Single chest = 27 slots, Double chest = 54 slots
    let totalSlots = 0;
    let usedSlots = 0;
    let totalItems = 0;
    let uniqueItemTypes = new Set<string>();
    let blockCount = 0;
    let itemCount = 0;

    // Check if an item is a block using minecraft-data
    const isBlockItem = (itemId: string): boolean => {
      const cleanId = itemId.replace('minecraft:', '').toLowerCase();
      return mcData.blocksByName[cleanId] !== undefined;
    };

    for (const chest of chests) {
      const slots = chest.isDoubleChest ? 54 : 27;
      totalSlots += slots;
      usedSlots += chest.items.length;

      for (const item of chest.items) {
        totalItems += item.count;
        uniqueItemTypes.add(item.itemId);
        
        if (isBlockItem(item.itemId)) {
          blockCount += item.count;
        } else {
          itemCount += item.count;
        }
      }
    }

    res.json({
      totalSlots,
      usedSlots,
      freeSlots: totalSlots - usedSlots,
      totalItems,
      uniqueItemTypes: uniqueItemTypes.size,
      chestCount: chests.length,
      blockCount,
      itemCount,
      usagePercent: totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

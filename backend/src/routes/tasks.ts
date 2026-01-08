import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { BotManager } from '../bot/BotManager.js';
import { emitToBot } from '../lib/socket.js';

const router = Router();

router.use(authMiddleware);

// Schema for creating a request task
const createTaskSchema = z.object({
  botId: z.string().uuid(),
  storageSystemId: z.string().uuid(),
  name: z.string().optional(),
  deliveryMethod: z.enum(['DROP_TO_PLAYER', 'PUT_IN_CHEST', 'SHULKER_DROP', 'SHULKER_CHEST']),
  packingMode: z.enum(['SELECTION_ORDER', 'OPTIMIZED']).default('OPTIMIZED'),
  targetPlayer: z.string().optional(),
  deliveryX: z.number().int().optional(),
  deliveryY: z.number().int().optional(),
  deliveryZ: z.number().int().optional(),
  selectedShulkerIds: z.array(z.string()).optional(),
  items: z.array(z.object({
    itemId: z.string(),
    itemName: z.string(),
    requestedCount: z.number().int().min(1),
    // Optional: specific shulker source (when selecting from shulker slide-out)
    fromShulker: z.boolean().optional(),
    shulkerContentId: z.string().optional(),
    shulkerChestItemId: z.string().optional(),
    shulkerSlotInChest: z.number().optional(),
    slotInShulker: z.number().optional(),
    chestX: z.number().optional(),
    chestY: z.number().optional(),
    chestZ: z.number().optional(),
  })),
});

// Schema for user decision on partial items
const itemDecisionSchema = z.object({
  decision: z.enum(['take_available', 'skip']),
});

// List all tasks for a bot
router.get('/bot/:botId', async (req: AuthRequest, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.botId,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    const tasks = await prisma.requestTask.findMany({
      where: { botId: req.params.botId },
      include: {
        items: true,
      },
      orderBy: [
        { createdAt: 'desc' }, // Newest first
      ],
    });

    res.json(tasks);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single task
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const task = await prisma.requestTask.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Verify ownership via bot
    const bot = await prisma.bot.findFirst({
      where: {
        id: task.botId,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new request task
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createTaskSchema.parse(req.body);

    // Verify bot ownership
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

    // Verify storage system belongs to bot
    const storage = await prisma.storageSystem.findFirst({
      where: {
        id: data.storageSystemId,
        botId: data.botId,
      },
    });

    if (!storage) {
      res.status(404).json({ error: 'Storage system not found' });
      return;
    }

    // Get the next queue position
    const lastTask = await prisma.requestTask.findFirst({
      where: {
        botId: data.botId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED'] },
      },
      orderBy: { queuePosition: 'desc' },
    });
    const nextPosition = (lastTask?.queuePosition ?? 0) + 1;

    // Calculate shulkers needed if using shulker delivery
    let shulkersNeeded = 0;
    if (data.deliveryMethod === 'SHULKER_DROP' || data.deliveryMethod === 'SHULKER_CHEST') {
      const totalItems = data.items.reduce((sum, item) => sum + item.requestedCount, 0);
      // Shulker has 27 slots, assuming max stack of 64
      // This is a rough estimate - actual calculation depends on stackability
      shulkersNeeded = Math.ceil(totalItems / (27 * 64));
    }

    // Find source locations for each item
    // Sources can be: 1) direct chest items, 2) items inside shulker boxes
    // If item has fromShulker=true with shulkerContentId, use that specific source only
    const itemsWithLocations = await Promise.all(
      data.items.map(async (item) => {
        // If item was selected from a specific shulker, use that source directly
        if (item.fromShulker && item.shulkerContentId) {
          // Get the specific shulker content
          const shulkerContent = await prisma.shulkerContent.findUnique({
            where: { id: item.shulkerContentId },
            include: {
              chestItem: {
                include: {
                  chest: { select: { x: true, y: true, z: true } },
                },
              },
            },
          });

          if (!shulkerContent) {
            // Source no longer exists
            return {
              itemId: item.itemId,
              itemName: item.itemName,
              requestedCount: item.requestedCount,
              sourceLocations: [],
              status: 'partial',
            };
          }

          const sourceLocations = [{
            chestItemId: shulkerContent.chestItem.id,
            chestId: shulkerContent.chestItem.chestId,
            x: shulkerContent.chestItem.chest.x,
            y: shulkerContent.chestItem.chest.y,
            z: shulkerContent.chestItem.chest.z,
            slot: shulkerContent.chestItem.slot,
            available: shulkerContent.count,
            fromShulker: true,
            shulkerContentId: shulkerContent.id,
            slotInShulker: shulkerContent.slot,
            shulkerItemId: shulkerContent.chestItem.itemId,
          }];

          return {
            itemId: item.itemId,
            itemName: item.itemName,
            requestedCount: item.requestedCount,
            sourceLocations,
            status: shulkerContent.count >= item.requestedCount ? 'pending' : 'partial',
          };
        }

        // Regular item: find all sources (direct chest items + shulker contents)
        const chestItems = await prisma.chestItem.findMany({
          where: {
            itemId: item.itemId,
            isShulkerBox: false, // Exclude shulker boxes themselves
            chest: {
              storageSystemId: data.storageSystemId,
            },
          },
          include: {
            chest: {
              select: { x: true, y: true, z: true },
            },
          },
        });

        const sourceLocations: any[] = chestItems.map((ci) => ({
          chestItemId: ci.id,
          chestId: ci.chestId,
          x: ci.chest.x,
          y: ci.chest.y,
          z: ci.chest.z,
          slot: ci.slot,
          available: ci.count,
          fromShulker: false,
        }));

        // Also find items inside shulker boxes
        const shulkerContents = await prisma.shulkerContent.findMany({
          where: {
            itemId: item.itemId,
            chestItem: {
              chest: {
                storageSystemId: data.storageSystemId,
              },
            },
          },
          include: {
            chestItem: {
              include: {
                chest: {
                  select: { x: true, y: true, z: true },
                },
              },
            },
          },
        });

        for (const content of shulkerContents) {
          sourceLocations.push({
            chestItemId: content.chestItem.id,  // The shulker's ChestItem.id
            chestId: content.chestItem.chestId,
            x: content.chestItem.chest.x,
            y: content.chestItem.chest.y,
            z: content.chestItem.chest.z,
            slot: content.chestItem.slot,  // Shulker's slot in the chest
            available: content.count,
            fromShulker: true,
            shulkerContentId: content.id,
            slotInShulker: content.slot,
            shulkerItemId: content.chestItem.itemId,  // e.g., "purple_shulker_box"
          });
        }

        const totalAvailable = sourceLocations.reduce((sum, loc) => sum + loc.available, 0);

        return {
          itemId: item.itemId,
          itemName: item.itemName,
          requestedCount: item.requestedCount,
          sourceLocations,
          status: totalAvailable >= item.requestedCount ? 'pending' : 'partial',
        };
      })
    );

    // Check if any items need user decision
    const hasPartialItems = itemsWithLocations.some((i) => i.status === 'partial');

    // Create the task
    const task = await prisma.requestTask.create({
      data: {
        botId: data.botId,
        storageSystemId: data.storageSystemId,
        name: data.name,
        status: hasPartialItems ? 'PAUSED' : 'PENDING',
        queuePosition: nextPosition,
        deliveryMethod: data.deliveryMethod,
        packingMode: data.packingMode,
        targetPlayer: data.targetPlayer,
        deliveryX: data.deliveryX,
        deliveryY: data.deliveryY,
        deliveryZ: data.deliveryZ,
        selectedShulkerIds: data.selectedShulkerIds || [],
        shulkersNeeded,
        totalItems: data.items.reduce((sum, i) => sum + i.requestedCount, 0),
        requiresInput: hasPartialItems,
        items: {
          create: itemsWithLocations.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            requestedCount: item.requestedCount,
            sourceLocations: item.sourceLocations,
            status: item.status,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    // Emit task created event
    emitToBot(data.botId, 'task:created', { task });

    // If no partial items, try to start processing
    if (!hasPartialItems) {
      BotManager.getInstance().processTaskQueue(data.botId);
    }

    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user decision for a partial item
router.patch('/:taskId/items/:itemId/decision', async (req: AuthRequest, res) => {
  try {
    const { decision } = itemDecisionSchema.parse(req.body);

    const task = await prisma.requestTask.findUnique({
      where: { id: req.params.taskId },
      include: { items: true },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Verify ownership
    const bot = await prisma.bot.findFirst({
      where: {
        id: task.botId,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Update the item decision
    await prisma.requestItem.update({
      where: { id: req.params.itemId },
      data: {
        userDecision: decision,
        status: decision === 'skip' ? 'skipped' : 'pending',
      },
    });

    // Check if all partial items now have decisions
    const remainingUndecided = await prisma.requestItem.count({
      where: {
        taskId: req.params.taskId,
        status: 'partial',
        userDecision: null,
      },
    });

    if (remainingUndecided === 0) {
      // All decisions made, move task to pending
      await prisma.requestTask.update({
        where: { id: req.params.taskId },
        data: {
          status: 'PENDING',
          requiresInput: false,
        },
      });

      // Try to start processing
      BotManager.getInstance().processTaskQueue(task.botId);
    }

    const updatedTask = await prisma.requestTask.findUnique({
      where: { id: req.params.taskId },
      include: { items: true },
    });

    emitToBot(task.botId, 'task:updated', { task: updatedTask });

    res.json(updatedTask);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Update item decision error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel a task
router.post('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const task = await prisma.requestTask.findUnique({
      where: { id: req.params.id },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Verify ownership
    const bot = await prisma.bot.findFirst({
      where: {
        id: task.botId,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      res.status(400).json({ error: 'Task already completed or cancelled' });
      return;
    }

    // If task is in progress, tell bot to stop
    if (task.status === 'IN_PROGRESS') {
      BotManager.getInstance().cancelTask(task.botId, task.id);
    }

    const updatedTask = await prisma.requestTask.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
      include: { items: true },
    });

    emitToBot(task.botId, 'task:updated', { task: updatedTask });

    res.json(updatedTask);
  } catch (error) {
    console.error('Cancel task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a task (only completed/cancelled/failed)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const task = await prisma.requestTask.findUnique({
      where: { id: req.params.id },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Verify ownership
    const bot = await prisma.bot.findFirst({
      where: {
        id: task.botId,
        userId: req.userId,
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (task.status === 'IN_PROGRESS') {
      res.status(400).json({ error: 'Cannot delete a task in progress' });
      return;
    }

    await prisma.requestTask.delete({
      where: { id: req.params.id },
    });

    emitToBot(task.botId, 'task:deleted', { taskId: task.id });

    res.status(204).send();
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available empty shulkers for selection
router.get('/storage/:storageId/empty-shulkers', async (req: AuthRequest, res) => {
  try {
    const storage = await prisma.storageSystem.findUnique({
      where: { id: req.params.storageId },
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

    // Find all empty shulker boxes (shulker box items with no contents)
    const emptyShulkers = await prisma.chestItem.findMany({
      where: {
        isShulkerBox: true,
        chest: {
          storageSystemId: req.params.storageId,
        },
        shulkerContents: {
          none: {},
        },
      },
      include: {
        chest: {
          select: { x: true, y: true, z: true },
        },
      },
    });

    res.json(
      emptyShulkers.map((s) => ({
        id: s.id,
        itemId: s.itemId,
        itemName: s.itemName,
        slot: s.slot,
        location: { x: s.chest.x, y: s.chest.y, z: s.chest.z },
      }))
    );
  } catch (error) {
    console.error('Get empty shulkers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

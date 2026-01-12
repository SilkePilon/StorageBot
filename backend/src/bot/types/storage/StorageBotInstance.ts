import { Vec3 } from 'vec3';
import { goals } from 'mineflayer-pathfinder';
import { BaseBotInstance, BotTypeConfig } from '../../BaseBotInstance.js';
import { prisma } from '../../../lib/prisma.js';
import { emitToBot } from '../../../lib/socket.js';
import {
  findChestsInRadius,
  findNearbyEmptyChest,
  findPlaceableSpot,
  getInventoryItems,
  countItemInInventory,
  findShulkerInInventory,
  parseShulkerContents,
} from '../../utils/index.js';
import { botTypeRegistry } from '../../BotTypeRegistry.js';

/**
 * Storage Bot - Manages Minecraft storage systems
 * Indexes chests, retrieves items, and handles shulker boxes
 */
export class StorageBotInstance extends BaseBotInstance {
  public readonly botType = 'storage';

  private isIndexing = false;
  private indexingCancelled = false;
  private currentIndexingStorageId: string | null = null;
  private currentTaskId: string | null = null;
  private taskCancelled = false;

  getTypeConfig(): BotTypeConfig {
    return {
      type: 'storage',
      name: 'Storage Bot',
      description: 'Indexes and manages Minecraft storage systems. Retrieves items on demand.',
      icon: 'Package',
      setupSteps: [
        {
          id: 'storage-location',
          title: 'Storage Location',
          description: 'Define the area where your storage chests are located',
          component: 'StorageLocationStep',
        },
        {
          id: 'index',
          title: 'Index Storage',
          description: 'Scan and index all chests in the storage area',
          component: 'IndexStorageStep',
        },
      ],
    };
  }

  protected getTypeSpecificStatus(): Record<string, any> {
    return {
      isIndexing: this.isIndexing,
    };
  }

  // ============ STORAGE-SPECIFIC: INDEXING ============

  getCurrentIndexingStorageId(): string | null {
    return this.currentIndexingStorageId;
  }

  stopIndexing(): boolean {
    if (!this.isIndexing) {
      return false;
    }
    console.log(`[Bot ${this.id}] Stopping indexing...`);
    this.indexingCancelled = true;
    return true;
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
    this.indexingCancelled = false;
    this.currentIndexingStorageId = storageId;
    this.setCurrentAction('Indexing storage...');

    try {
      emitToBot(this.id, 'storage:indexProgress', {
        botId: this.id,
        storageId,
        progress: 0,
        status: 'Moving to storage area',
      });

      await this.moveTo(storage.centerX, storage.centerY, storage.centerZ);

      emitToBot(this.id, 'storage:indexProgress', {
        botId: this.id,
        storageId,
        progress: 5,
        status: 'Scanning for chests',
      });

      const rawChests = findChestsInRadius(
        this.bot!,
        storage.centerX,
        storage.centerY,
        storage.centerZ,
        storage.radius
      );

      const remainingChests = [...rawChests];
      const totalChests = remainingChests.length;

      console.log(`Found ${totalChests} chests in storage ${storageId}`);

      if (totalChests === 0) {
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
          status: 'No chests found in storage area',
        });

        emitToBot(this.id, 'storage:indexComplete', {
          botId: this.id,
          storageId,
          totalChests: 0,
          wasStopped: false,
        });

        return;
      }

      await prisma.chest.deleteMany({
        where: { storageSystemId: storageId },
      });

      let indexed = 0;
      while (remainingChests.length > 0) {
        if (this.indexingCancelled) {
          console.log(`[Bot ${this.id}] Indexing stopped by user at ${indexed}/${totalChests} chests`);
          break;
        }

        const botPos = this.bot!.entity.position;
        let nearestIdx = 0;
        let nearestDist = Infinity;

        for (let i = 0; i < remainingChests.length; i++) {
          const chest = remainingChests[i];
          const dx = chest.x - botPos.x;
          const dy = (chest.y - botPos.y) * 0.3;
          const dz = chest.z - botPos.z;
          const dist = dx * dx + dy * dy + dz * dz;

          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = i;
          }
        }

        const chest = remainingChests.splice(nearestIdx, 1)[0];
        indexed++;

        const progress = Math.floor(5 + (indexed / totalChests) * 90);

        emitToBot(this.id, 'storage:indexProgress', {
          botId: this.id,
          storageId,
          progress,
          status: `Indexing chest ${indexed}/${totalChests}`,
          chestPosition: { x: chest.x, y: chest.y, z: chest.z },
        });

        try {
          const items = await this.openAndReadChest(chest.x, chest.y, chest.z);

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
                  isShulkerBox: item.isShulkerBox,
                  shulkerContents:
                    item.isShulkerBox && item.shulkerContents.length > 0
                      ? {
                          create: item.shulkerContents.map((content: any) => ({
                            slot: content.slot,
                            itemId: content.itemId,
                            itemName: content.itemName,
                            count: content.count,
                          })),
                        }
                      : undefined,
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

          emitToBot(this.id, 'storage:statsUpdated', { botId: this.id, storageId });

          await this.sleep(500);
        } catch (error) {
          console.error(`Failed to index chest at ${chest.x}, ${chest.y}, ${chest.z}:`, error);
        }
      }

      await prisma.storageSystem.update({
        where: { id: storageId },
        data: {
          isIndexed: true,
          lastIndexed: new Date(),
          indexProgress: this.indexingCancelled ? Math.floor(5 + (indexed / totalChests) * 90) : 100,
        },
      });

      const finalStatus = this.indexingCancelled
        ? `Indexing stopped (${indexed}/${totalChests} chests indexed)`
        : 'Indexing complete';

      emitToBot(this.id, 'storage:indexProgress', {
        botId: this.id,
        storageId,
        progress: this.indexingCancelled ? Math.floor(5 + (indexed / totalChests) * 90) : 100,
        status: finalStatus,
      });

      emitToBot(this.id, 'storage:indexComplete', {
        botId: this.id,
        storageId,
        totalChests: indexed,
        wasStopped: this.indexingCancelled,
      });

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
      this.currentIndexingStorageId = null;
      this.setCurrentAction(undefined);
    }
  }

  /**
   * Safely open a container block with proper lookAt and retry logic.
   * This is the core method for opening chests/barrels/shulkers reliably.
   */
  private async safeOpenContainer(block: any, maxRetries: number = 3): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Calculate the center of the block for looking
        const blockCenter = block.position.offset(0.5, 0.5, 0.5);
        
        // Look at the block center - this is crucial for Minecraft to accept the interaction
        await this.bot.lookAt(blockCenter, true);
        await this.bot.waitForTicks(2); // Wait for physics to sync
        
        // Small delay to ensure server receives the look packet
        await this.sleep(50);
        
        // Open the container
        const container = await this.bot.openContainer(block);
        
        // Give the window time to populate its items
        await this.sleep(100);
        
        return container;
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        console.warn(`[Bot ${this.id}] Attempt ${attempt}/${maxRetries} to open container failed: ${errorMsg}`);
        
        if (attempt < maxRetries) {
          // Wait longer between retries with exponential backoff
          await this.sleep(200 * attempt);
          
          // Try to look at the block again from a slightly different angle
          const offset = (attempt - 1) * 0.1;
          const blockPos = block.position.offset(0.5 + offset, 0.5, 0.5 - offset);
          await this.bot.lookAt(blockPos, true);
          await this.bot.waitForTicks(3);
        } else {
          throw new Error(`Failed to open container after ${maxRetries} attempts: ${errorMsg}`);
        }
      }
    }
    
    throw new Error('Failed to open container: unexpected state');
  }

  private async openAndReadChest(x: number, y: number, z: number): Promise<any[]> {
    if (!this.bot) throw new Error('Bot not connected');

    const block = this.bot.blockAt(new Vec3(x, y, z));
    if (!block) throw new Error('Block not found');

    await this.moveToBlock(x, y, z);
    await this.sleep(150);

    // Use safe container opening with lookAt and retries
    const chest = await this.safeOpenContainer(block);

    const items = chest.containerItems().map((item: any) => {
      const baseItem = {
        slot: item.slot,
        itemId: item.name,
        itemName: item.displayName,
        count: item.count,
        nbt: item.nbt || null,
        isShulkerBox: false,
        shulkerContents: [] as { slot: number; itemId: string; itemName: string; count: number }[],
      };

      if (item.name.includes('shulker_box')) {
        baseItem.isShulkerBox = true;
        const contents = parseShulkerContents(this.bot!, item);
        if (contents.length > 0) {
          baseItem.shulkerContents = contents;
        }
      }

      return baseItem;
    });

    await this.sleep(50);
    chest.close();

    return items;
  }

  // ============ TASK EXECUTION ============

  cancelCurrentTask(taskId: string): void {
    if (this.currentTaskId === taskId) {
      this.taskCancelled = true;
    }
  }

  async executeTask(task: any): Promise<void> {
    if (!this.bot || !this.getStatus().spawned) {
      throw new Error('Bot not connected');
    }

    this.currentTaskId = task.id;
    this.taskCancelled = false;

    console.log(`[Task ${task.id}] Executing: ${task.items?.length || 0} items, method: ${task.deliveryMethod}`);

    try {
      const collectedItems = await this.collectTaskItems(task);

      if (this.taskCancelled) {
        throw new Error('Task cancelled');
      }

      const totalCollected = Array.from(collectedItems.values()).reduce((sum, count) => sum + count, 0);
      console.log(`[Task ${task.id}] Collected ${totalCollected} items total`);

      if (totalCollected === 0) {
        const expectedItems = task.items
          .filter((i: any) => i.status !== 'skipped')
          .map((i: any) => i.itemName)
          .join(', ');
        throw new Error(`Failed to collect any items. Expected: ${expectedItems}`);
      }

      switch (task.deliveryMethod) {
        case 'DROP_TO_PLAYER':
          await this.deliverToPlayer(task, collectedItems);
          break;
        case 'PUT_IN_CHEST':
          await this.deliverToChest(task, collectedItems);
          break;
        case 'SHULKER_DROP':
          await this.packItemsIntoShulkers(task, collectedItems);
          break;
        case 'SHULKER_CHEST':
          await this.packItemsIntoShulkers(task, collectedItems);
          const shulkersForChest = this.findShulkersContainingItems(collectedItems);
          if (shulkersForChest.length === 0) {
            shulkersForChest.push(...getInventoryItems(this.bot!).filter((s: any) => s.name.includes('shulker_box')));
          }
          if (shulkersForChest.length > 0) {
            const shulkerChestMap = new Map<string, number>();
            for (const s of shulkersForChest) {
              shulkerChestMap.set(s.name, (shulkerChestMap.get(s.name) || 0) + s.count);
            }
            await this.deliverToChest(task, shulkerChestMap);
          }
          break;
        default:
          throw new Error(`Unknown delivery method: ${task.deliveryMethod}`);
      }
    } finally {
      this.currentTaskId = null;
      this.taskCancelled = false;
      this.setCurrentAction(undefined);
    }
  }

  private findShulkersContainingItems(requestedItems: Map<string, number>): any[] {
    if (!this.bot) return [];

    const requestedItemNames = new Set(requestedItems.keys());
    const result: any[] = [];

    const shulkersInInventory = getInventoryItems(this.bot).filter((slot: any) => slot.name.includes('shulker_box'));

    for (const shulker of shulkersInInventory) {
      const contents = parseShulkerContents(this.bot, shulker);

      if (requestedItemNames.size === 0) {
        if (contents.length > 0) {
          result.push(shulker);
        }
        continue;
      }

      const hasRequestedItem = contents.some(
        (content) =>
          requestedItemNames.has(content.itemId) || requestedItemNames.has(`minecraft:${content.itemId}`)
      );

      if (hasRequestedItem) {
        result.push(shulker);
      }
    }

    return result;
  }

  private async collectNearbyDroppedItem(itemNameContains: string, timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    const botPos = this.bot!.entity.position;
    const filterName = itemNameContains.toLowerCase();

    const findDroppedItems = () => {
      return Object.values(this.bot!.entities).filter((e: any) => {
        const isItemEntity =
          e.name === 'item' ||
          e.name === 'item_stack' ||
          e.entityType === 'item' ||
          (e.type === 'object' && e.objectType === 'Item') ||
          e.displayName === 'Item';

        if (!isItemEntity) return false;
        if (e.position.distanceTo(botPos) >= 8) return false;

        if (filterName && e.metadata) {
          const itemData = e.metadata.find((m: any) => m && typeof m === 'object' && m.itemId);
          if (itemData && itemData.itemId !== undefined) {
            // itemId can be a number (registry ID) or an object with name property
            let itemName = '';
            if (typeof itemData.itemId === 'object' && itemData.itemId.name) {
              itemName = itemData.itemId.name;
            } else if (typeof itemData.itemId === 'string') {
              itemName = itemData.itemId;
            } else if (typeof itemData.itemId === 'number' && this.bot?.registry?.items?.[itemData.itemId]) {
              itemName = this.bot.registry.items[itemData.itemId].name || '';
            }
            return itemName.toLowerCase().includes(filterName);
          }
        }

        return true;
      });
    };

    while (Date.now() - startTime < timeoutMs) {
      if (findShulkerInInventory(this.bot!)) return true;

      const nearbyItems = findDroppedItems();

      if (nearbyItems.length > 0) {
        const nearest = nearbyItems.reduce((a: any, b: any) =>
          a.position.distanceTo(botPos) < b.position.distanceTo(botPos) ? a : b
        ) as any;

        const distToItem = nearest.position.distanceTo(this.bot!.entity.position);

        if (distToItem > 1.5) {
          try {
            await this.bot!.pathfinder.goto(
              new goals.GoalNear(nearest.position.x, nearest.position.y, nearest.position.z, 1)
            );
          } catch {
            await this.bot!.lookAt(nearest.position, true);
            this.bot!.setControlState('forward', true);
            await this.sleep(500);
            this.bot!.setControlState('forward', false);
          }
        } else {
          await this.bot!.lookAt(nearest.position, true);
        }

        await this.sleep(300);
        if (findShulkerInInventory(this.bot!)) return true;
      }

      await this.sleep(100);
    }

    return !!findShulkerInInventory(this.bot!);
  }

  private async collectTaskItems(task: any): Promise<Map<string, number>> {
    const collected = new Map<string, number>();

    const itemsNeeded = new Map<string, { item: any; remaining: number }>();
    for (const item of task.items) {
      if (item.status === 'skipped') continue;
      const locations = item.sourceLocations as any[];
      if (!locations || locations.length === 0) continue;

      const remaining =
        item.userDecision === 'take_available'
          ? Math.min(item.requestedCount, locations.reduce((sum: number, l: any) => sum + l.available, 0))
          : item.requestedCount;
      itemsNeeded.set(item.id, { item, remaining });
    }

    if (itemsNeeded.size === 0) return collected;

    interface DirectSlot {
      slot: number;
      itemId: string;
      requestItemId: string;
      chestItemId: string;
      available: number;
      fromShulker: false;
    }

    interface ShulkerSlot {
      slot: number;
      itemId: string;
      requestItemId: string;
      chestItemId: string;
      available: number;
      fromShulker: true;
      shulkerContentId: string;
      slotInShulker: number;
      shulkerItemId: string;
    }

    interface ChestCollectionPlan {
      x: number;
      y: number;
      z: number;
      directSlots: DirectSlot[];
      shulkerSlots: ShulkerSlot[];
    }

    const chestPlans = new Map<string, ChestCollectionPlan>();

    for (const item of task.items) {
      if (item.status === 'skipped') continue;
      const locations = item.sourceLocations as any[];
      if (!locations || locations.length === 0) continue;

      for (const loc of locations) {
        if (loc.x === undefined || loc.y === undefined || loc.z === undefined) continue;

        const key = `${loc.x},${loc.y},${loc.z}`;
        if (!chestPlans.has(key)) {
          chestPlans.set(key, { x: loc.x, y: loc.y, z: loc.z, directSlots: [], shulkerSlots: [] });
        }

        if (loc.fromShulker) {
          chestPlans.get(key)!.shulkerSlots.push({
            slot: loc.slot,
            itemId: item.itemId,
            requestItemId: item.id,
            chestItemId: loc.chestItemId,
            available: loc.available,
            fromShulker: true,
            shulkerContentId: loc.shulkerContentId,
            slotInShulker: loc.slotInShulker,
            shulkerItemId: loc.shulkerItemId,
          });
        } else {
          chestPlans.get(key)!.directSlots.push({
            slot: loc.slot,
            itemId: item.itemId,
            requestItemId: item.id,
            chestItemId: loc.chestItemId,
            available: loc.available,
            fromShulker: false,
          });
        }
      }
    }

    const botPos = this.bot!.entity.position;
    const sortedChests = Array.from(chestPlans.values()).sort((a, b) => {
      const distA = Math.sqrt((a.x - botPos.x) ** 2 + (a.y - botPos.y) ** 2 + (a.z - botPos.z) ** 2);
      const distB = Math.sqrt((b.x - botPos.x) ** 2 + (b.y - botPos.y) ** 2 + (b.z - botPos.z) ** 2);
      return distA - distB;
    });

    for (const chestPlan of sortedChests) {
      if (this.taskCancelled) break;

      const directToCollect = chestPlan.directSlots.filter((slot) => {
        const needed = itemsNeeded.get(slot.requestItemId);
        return needed && needed.remaining > 0;
      });

      const shulkerToCollect = chestPlan.shulkerSlots.filter((slot) => {
        const needed = itemsNeeded.get(slot.requestItemId);
        return needed && needed.remaining > 0;
      });

      if (directToCollect.length === 0 && shulkerToCollect.length === 0) continue;

      await this.updateTaskStep(task.id, `Opening chest at ${chestPlan.x}, ${chestPlan.y}, ${chestPlan.z}...`);

      try {
        await this.moveToBlock(chestPlan.x, chestPlan.y, chestPlan.z);
        await this.sleep(150);

        const block = this.bot!.blockAt(new Vec3(chestPlan.x, chestPlan.y, chestPlan.z));
        if (!block) continue;

        const chest = await this.safeOpenContainer(block);

        const withdrawnFromChest: { slotInfo: any; actualTake: number }[] = [];

        for (const slotInfo of directToCollect) {
          if (this.taskCancelled) break;

          const needed = itemsNeeded.get(slotInfo.requestItemId);
          if (!needed || needed.remaining <= 0) continue;

          const toTake = Math.min(needed.remaining, slotInfo.available);
          if (toTake <= 0) continue;

          const chestItem = chest.containerItems().find((i: any) => i.slot === slotInfo.slot);
          if (chestItem && chestItem.name === slotInfo.itemId) {
            const actualTake = Math.min(toTake, chestItem.count);

            try {
              await chest.withdraw(chestItem.type, null, actualTake);
              withdrawnFromChest.push({ slotInfo, actualTake });
              needed.remaining -= actualTake;
              await this.sleep(50);
            } catch {
              continue;
            }
          }
        }

        if (shulkerToCollect.length === 0) {
          chest.close();
          await this.sleep(300);

          for (const { slotInfo, actualTake } of withdrawnFromChest) {
            if (slotInfo.chestItemId) {
              const newCount = slotInfo.available - actualTake;
              if (newCount <= 0) {
                await prisma.chestItem.delete({ where: { id: slotInfo.chestItemId } }).catch(() => {});
              } else {
                await prisma.chestItem.update({ where: { id: slotInfo.chestItemId }, data: { count: newCount } }).catch(() => {});
              }
            }

            collected.set(slotInfo.itemId, (collected.get(slotInfo.itemId) || 0) + actualTake);
            await this.updateItemProgress(
              task.id,
              slotInfo.requestItemId,
              slotInfo.itemId,
              actualTake,
              itemsNeeded.get(slotInfo.requestItemId)?.remaining || 0,
              task.storageSystemId
            );
          }

          await this.sleep(200);
          continue;
        }

        for (const { slotInfo, actualTake } of withdrawnFromChest) {
          if (slotInfo.chestItemId) {
            const newCount = slotInfo.available - actualTake;
            if (newCount <= 0) {
              await prisma.chestItem.delete({ where: { id: slotInfo.chestItemId } }).catch((err) => {
                console.error(`[Bot ${this.id}] Failed to delete chestItem:`, err);
              });
            } else {
              await prisma.chestItem.update({ where: { id: slotInfo.chestItemId }, data: { count: newCount } }).catch((err) => {
                console.error(`[Bot ${this.id}] Failed to update chestItem:`, err);
              });
            }
          }
          collected.set(slotInfo.itemId, (collected.get(slotInfo.itemId) || 0) + actualTake);
          await this.updateItemProgress(
            task.id,
            slotInfo.requestItemId,
            slotInfo.itemId,
            actualTake,
            itemsNeeded.get(slotInfo.requestItemId)?.remaining || 0,
            task.storageSystemId
          );
        }

        const shulkerGroups = new Map<string, ShulkerSlot[]>();
        for (const slot of shulkerToCollect) {
          if (!shulkerGroups.has(slot.chestItemId)) {
            shulkerGroups.set(slot.chestItemId, []);
          }
          shulkerGroups.get(slot.chestItemId)!.push(slot);
        }

        for (const [, slots] of shulkerGroups) {
          if (this.taskCancelled) break;

          const slotsStillNeeded = slots.filter((s) => {
            const needed = itemsNeeded.get(s.requestItemId);
            return needed && needed.remaining > 0;
          });

          if (slotsStillNeeded.length === 0) continue;

          const shulkerSlot = slotsStillNeeded[0].slot;
          const shulkerInChest = chest.containerItems().find((i: any) => i.slot === shulkerSlot && i.name.includes('shulker_box'));

          if (!shulkerInChest) continue;

          const shulkerOriginalSlot = shulkerInChest.slot;
          await chest.withdraw(shulkerInChest.type, null, 1);
          await this.sleep(100);
          chest.close();
          await this.sleep(200);

          const placePos = findPlaceableSpot(this.bot!);
          if (!placePos) {
            const chestAgain = await this.safeOpenContainer(block);
            const shulkerInv = findShulkerInInventory(this.bot!);
            if (shulkerInv) {
              await chestAgain.deposit(shulkerInv.type, null, 1);
            }
            chestAgain.close();
            continue;
          }

          const shulkerInInventory = findShulkerInInventory(this.bot!);
          if (!shulkerInInventory) continue;

          await this.bot!.equip(shulkerInInventory, 'hand');
          await this.sleep(100);

          const referenceBlock = this.bot!.blockAt(placePos.offset(0, -1, 0));
          if (referenceBlock) {
            try {
              await this.bot!.placeBlock(referenceBlock, new Vec3(0, 1, 0));
              await this.sleep(400);
            } catch {
              continue;
            }
          }

          const placedShulker = this.bot!.blockAt(placePos);
          if (placedShulker?.name.includes('shulker_box')) {
            const shulkerContainer = await this.safeOpenContainer(placedShulker);

            for (const slotInfo of slotsStillNeeded) {
              if (this.taskCancelled) break;

              const needed = itemsNeeded.get(slotInfo.requestItemId);
              if (!needed || needed.remaining <= 0) continue;

              const toTake = Math.min(needed.remaining, slotInfo.available);
              if (toTake <= 0) continue;

              const itemInShulker = shulkerContainer.containerItems().find((i: any) => i.slot === slotInfo.slotInShulker);
              if (itemInShulker && itemInShulker.name === slotInfo.itemId) {
                const actualTake = Math.min(toTake, itemInShulker.count);
                await shulkerContainer.withdraw(itemInShulker.type, null, actualTake);
                needed.remaining -= actualTake;
                collected.set(slotInfo.itemId, (collected.get(slotInfo.itemId) || 0) + actualTake);

                if (slotInfo.shulkerContentId) {
                  const newCount = slotInfo.available - actualTake;
                  if (newCount <= 0) {
                    await prisma.shulkerContent.delete({ where: { id: slotInfo.shulkerContentId } }).catch((err) => {
                      console.error(`[Bot ${this.id}] Failed to delete shulkerContent:`, err);
                    });
                  } else {
                    await prisma.shulkerContent.update({ where: { id: slotInfo.shulkerContentId }, data: { count: newCount } }).catch((err) => {
                      console.error(`[Bot ${this.id}] Failed to update shulkerContent:`, err);
                    });
                  }
                }

                await this.updateItemProgress(task.id, slotInfo.requestItemId, slotInfo.itemId, actualTake, needed.remaining, task.storageSystemId);
                await this.sleep(50);
              }
            }

            shulkerContainer.close();
            await this.sleep(300);

            await this.bot!.dig(placedShulker);
            await this.collectNearbyDroppedItem('shulker_box', 3000);

            const shulkerInInv = findShulkerInInventory(this.bot!);
            if (!shulkerInInv) {
              await this.sleep(500);
              continue;
            }

            await this.moveToBlock(chestPlan.x, chestPlan.y, chestPlan.z);
            await this.sleep(150);

            const chestAgain = await this.safeOpenContainer(block);

            const shulkerToReturn = findShulkerInInventory(this.bot!);
            if (shulkerToReturn) {
              await chestAgain.deposit(shulkerToReturn.type, null, 1);
              await this.sleep(100);

              const depositedShulker = chestAgain.containerItems().find((i: any) => i.name.includes('shulker_box') && i.name === shulkerToReturn.name);
              if (depositedShulker && depositedShulker.slot !== shulkerOriginalSlot) {
                const chestItemId = slotsStillNeeded[0]?.chestItemId;
                if (chestItemId) {
                  await prisma.chestItem
                    .update({
                      where: { id: chestItemId },
                      data: { slot: depositedShulker.slot },
                    })
                    .catch((err) => {
                      console.error(`Failed to update shulker slot in DB:`, err);
                    });
                }
              }
            }

            chestAgain.close();
            await this.sleep(100);

            emitToBot(this.id, 'storage:itemUpdated', { storageId: task.storageSystemId });
          }
        }

        await this.sleep(200);
      } catch (error) {
        console.error(`Failed to collect from chest at ${chestPlan.x},${chestPlan.y},${chestPlan.z}:`, error);
      }
    }

    return collected;
  }

  private async updateItemProgress(
    taskId: string,
    requestItemId: string,
    itemId: string,
    actualTake: number,
    remaining: number,
    storageId: string
  ): Promise<void> {
    await prisma.requestItem.update({
      where: { id: requestItemId },
      data: {
        collectedCount: { increment: actualTake },
        status: remaining <= 0 ? 'complete' : 'collecting',
      },
    });

    await prisma.requestTask.update({
      where: { id: taskId },
      data: { collectedItems: { increment: actualTake } },
    });

    emitToBot(this.id, 'task:progress', {
      taskId,
      itemId,
      collected: actualTake,
      remaining,
    });

    emitToBot(this.id, 'storage:itemUpdated', {
      storageId,
      itemId,
    });
  }

  private async deliverToPlayer(task: any, items: Map<string, number>): Promise<void> {
    if (!task.targetPlayer) {
      throw new Error('No target player specified');
    }

    await this.updateTaskStep(task.id, `Walking to ${task.targetPlayer}...`);

    const player = this.bot!.players[task.targetPlayer];
    if (!player || !player.entity) {
      throw new Error(`Player ${task.targetPlayer} not found or not nearby`);
    }

    await this.moveTo(player.entity.position.x, player.entity.position.y, player.entity.position.z);
    await this.sleep(500);

    await this.updateTaskStep(task.id, `Dropping items to ${task.targetPlayer}...`);

    const itemsToDeliver = new Set(items.keys());

    for (const item of getInventoryItems(this.bot!)) {
      if (this.taskCancelled) break;

      if (!itemsToDeliver.has(item.name)) continue;

      const neededCount = items.get(item.name) || 0;
      if (neededCount <= 0) continue;

      const tossCount = Math.min(item.count, neededCount);

      const targetPlayer = this.bot!.players[task.targetPlayer];
      if (targetPlayer?.entity) {
        await this.lookAtWithRetry(targetPlayer.entity.position, 3);
      }

      try {
        await this.bot!.toss(item.type, null, tossCount);
        items.set(item.name, neededCount - tossCount);
      } catch (e) {
        console.error(`[Task ${task.id}] Failed to toss ${item.name}:`, e);
      }
      await this.sleep(150);
    }
  }

  private async deliverToChest(task: any, items: Map<string, number>): Promise<void> {
    if (task.deliveryX === null || task.deliveryY === null || task.deliveryZ === null) {
      throw new Error('No delivery location specified');
    }

    await this.updateTaskStep(task.id, 'Walking to delivery location...');
    await this.moveTo(task.deliveryX, task.deliveryY, task.deliveryZ);
    await this.sleep(500);

    const chestBlock = await findNearbyEmptyChest(this.bot!, task.deliveryX, task.deliveryY, task.deliveryZ);
    if (!chestBlock) {
      throw new Error('No empty chest found within 4 blocks of delivery location');
    }

    await this.updateTaskStep(task.id, 'Depositing items...');
    await this.moveToBlock(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z);
    await this.sleep(150);

    const chest = await this.safeOpenContainer(chestBlock);

    const itemsToDeliver = new Set(items.keys());

    for (const item of getInventoryItems(this.bot!)) {
      if (this.taskCancelled) break;
      if (!itemsToDeliver.has(item.name)) continue;

      const neededCount = items.get(item.name) || 0;
      if (neededCount <= 0) continue;

      const depositCount = Math.min(item.count, neededCount);
      try {
        await chest.deposit(item.type, null, depositCount);
        items.set(item.name, neededCount - depositCount);
        await this.sleep(100);
      } catch (e) {
        console.error(`Failed to deposit ${item.name}:`, e);
      }
    }

    chest.close();
  }

  private async packItemsIntoShulkers(task: any, collectedItems: Map<string, number>): Promise<void> {
    if (!task.selectedShulkerIds || task.selectedShulkerIds.length === 0) {
      throw new Error('No shulkers selected for packing');
    }

    const shulkerItems = await prisma.chestItem.findMany({
      where: { id: { in: task.selectedShulkerIds } },
      include: { chest: true },
    });

    if (shulkerItems.length === 0) {
      throw new Error('Selected shulkers not found in storage');
    }

    const itemsToPack = new Map(collectedItems);

    const getPackableItems = () => {
      return getInventoryItems(this.bot!).filter((item: any) => {
        const remaining = itemsToPack.get(item.name);
        return remaining !== undefined && remaining > 0 && !item.name.includes('shulker_box');
      });
    };

    let packableItems = getPackableItems();
    if (packableItems.length === 0) return;

    let shulkerIndex = 0;

    while (shulkerIndex < shulkerItems.length && packableItems.length > 0) {
      if (this.taskCancelled) break;

      const shulkerItem = shulkerItems[shulkerIndex];
      await this.updateTaskStep(task.id, `Getting shulker ${shulkerIndex + 1}/${shulkerItems.length}...`);

      await this.moveToBlock(shulkerItem.chest.x, shulkerItem.chest.y, shulkerItem.chest.z);
      await this.sleep(150);

      const chestBlock = this.bot!.blockAt(new Vec3(shulkerItem.chest.x, shulkerItem.chest.y, shulkerItem.chest.z));
      if (!chestBlock) {
        shulkerIndex++;
        continue;
      }

      const chest = await this.safeOpenContainer(chestBlock);

      const shulkerInChest = chest.containerItems().find((i: any) => i.slot === shulkerItem.slot && i.name.includes('shulker_box'));

      if (!shulkerInChest) {
        chest.close();
        shulkerIndex++;
        continue;
      }

      await chest.withdraw(shulkerInChest.type, null, 1);
      chest.close();
      await this.sleep(200);

      await prisma.chestItem.delete({ where: { id: shulkerItem.id } }).catch((err) => {
        console.error(`[Bot ${this.id}] Failed to delete shulker chestItem:`, err);
      });

      const placePos = findPlaceableSpot(this.bot!);
      if (!placePos) {
        shulkerIndex++;
        continue;
      }

      const shulkerInInv = findShulkerInInventory(this.bot!);
      if (!shulkerInInv) {
        shulkerIndex++;
        continue;
      }

      await this.bot!.equip(shulkerInInv, 'hand');
      await this.sleep(100);

      const referenceBlock = this.bot!.blockAt(placePos.offset(0, -1, 0));
      if (!referenceBlock) {
        shulkerIndex++;
        continue;
      }

      try {
        await this.lookAtWithRetry(placePos, 2);
        await this.bot!.placeBlock(referenceBlock, new Vec3(0, 1, 0));
        await this.sleep(500);
      } catch {
        shulkerIndex++;
        continue;
      }

      const placedShulker = this.bot!.blockAt(placePos);
      if (!placedShulker || !placedShulker.name.includes('shulker_box')) {
        shulkerIndex++;
        continue;
      }

      const shulkerContainer = await this.safeOpenContainer(placedShulker);
      await this.sleep(100);

      await this.updateTaskStep(task.id, `Packing items into shulker ${shulkerIndex + 1}...`);
      packableItems = getPackableItems();

      for (const item of packableItems) {
        if (this.taskCancelled) break;

        const remainingToPack = itemsToPack.get(item.name) || 0;
        if (remainingToPack <= 0) continue;

        const depositCount = Math.min(item.count, remainingToPack);
        const beforeCount = countItemInInventory(this.bot!, item.name);

        try {
          const invItem = this.bot!.inventory.slots[item.slot];
          if (!invItem || invItem.name !== item.name) {
            const foundItem = this.bot!.inventory.items().find((i: any) => i.name === item.name);
            if (foundItem) {
              await shulkerContainer.deposit(foundItem.type, foundItem.metadata, depositCount);
            } else {
              continue;
            }
          } else {
            await shulkerContainer.deposit(item.type, item.metadata, depositCount);
          }
          await this.sleep(150);

          const actualDeposited = beforeCount - countItemInInventory(this.bot!, item.name);
          if (actualDeposited > 0) {
            itemsToPack.set(item.name, remainingToPack - actualDeposited);
          }
        } catch {
          break;
        }
      }

      shulkerContainer.close();
      await this.sleep(300);

      const shulkerToBreak = this.bot!.blockAt(placePos);
      if (shulkerToBreak?.name.includes('shulker_box')) {
        await this.bot!.dig(shulkerToBreak);
        await this.sleep(300);

        if (!findShulkerInInventory(this.bot!)) {
          await this.collectNearbyDroppedItem('shulker_box', 3000);
          await this.sleep(500);
        }
      }

      shulkerIndex++;
      packableItems = getPackableItems();
      if (packableItems.length === 0) break;
    }

    if (task.targetPlayer) {
      let shulkersToDeliver = this.findShulkersContainingItems(itemsToPack);

      if (shulkersToDeliver.length === 0) {
        shulkersToDeliver = getInventoryItems(this.bot!).filter((s: any) => s.name.includes('shulker_box'));
      }

      if (shulkersToDeliver.length > 0) {
        const player = this.bot!.players[task.targetPlayer];
        if (player?.entity) {
          await this.updateTaskStep(task.id, `Walking to ${task.targetPlayer}...`);
          await this.moveTo(player.entity.position.x, player.entity.position.y, player.entity.position.z);
          await this.sleep(500);

          await this.updateTaskStep(task.id, `Dropping shulkers to ${task.targetPlayer}...`);

          for (const shulker of shulkersToDeliver) {
            if (this.taskCancelled) break;

            const targetPlayer = this.bot!.players[task.targetPlayer];
            if (targetPlayer?.entity) {
              await this.lookAtWithRetry(targetPlayer.entity.position, 3);
              await this.bot!.waitForTicks(3);
            }

            try {
              await this.bot!.toss(shulker.type, null, shulker.count);
            } catch {
              /* ignore toss errors */
            }
            await this.sleep(150);
          }

          const botPos = this.bot!.entity.position;
          const playerPos = player.entity.position;
          const dx = botPos.x - playerPos.x;
          const dz = botPos.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist > 0.1) {
            const backX = botPos.x + (dx / dist) * 3;
            const backZ = botPos.z + (dz / dist) * 3;
            await this.moveTo(backX, botPos.y, backZ);
          } else {
            await this.moveTo(botPos.x + 3, botPos.y, botPos.z);
          }
        }
      }
    }
  }

  private async updateTaskStep(taskId: string, step: string): Promise<void> {
    this.setCurrentAction(step);

    await prisma.requestTask.update({
      where: { id: taskId },
      data: { currentStep: step },
    });

    emitToBot(this.id, 'task:step', { taskId, step });
  }
}

// Register this bot type
botTypeRegistry.register({
  type: 'storage',
  name: 'Storage Bot',
  description: 'Indexes and manages Minecraft storage systems. Retrieves items on demand.',
  icon: 'Package',
  setupSteps: [
    {
      id: 'storage-location',
      title: 'Storage Location',
      description: 'Define the area where your storage chests are located',
      component: 'StorageLocationStep',
    },
    {
      id: 'index',
      title: 'Index Storage',
      description: 'Scan and index all chests in the storage area',
      component: 'IndexStorageStep',
    },
  ],
  createInstance: (botId: string, userId: string) => new StorageBotInstance(botId, userId),
});

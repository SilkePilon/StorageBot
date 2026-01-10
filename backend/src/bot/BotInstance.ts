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
  isIndexing?: boolean;
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
  private indexingCancelled = false;
  private currentIndexingStorageId: string | null = null;
  private currentTaskId: string | null = null;
  private taskCancelled = false;
  private lastMoveEmit: number = 0;
  private moveEmitThrottle: number = 500; // Throttle to 2 updates per second

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
      return { connected: false, spawned: false, isIndexing: false };
    }

    return {
      connected: this.status.connected,
      spawned: this.status.spawned,
      isIndexing: this.isIndexing,
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
              console.log(`[Bot ${this.id}] Emitting bot:msaCode to room bot:${this.id}`);
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
      // Throttle position updates to prevent excessive WebSocket traffic
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

  /**
   * Optimize chest visit order using nearest neighbor algorithm.
   * This minimizes backtracking by always going to the closest unvisited chest.
   */
  private optimizeChestPath(chests: any[], startX: number, startY: number, startZ: number): any[] {
    if (chests.length <= 1) return chests;

    const optimized: any[] = [];
    const remaining = [...chests];
    let currentX = startX;
    let currentY = startY;
    let currentZ = startZ;

    while (remaining.length > 0) {
      // Find nearest chest to current position
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const chest = remaining[i];
        // Use 3D distance, with Y weighted less since vertical movement is often easier
        const dx = chest.x - currentX;
        const dy = (chest.y - currentY) * 0.5; // Weight Y less
        const dz = chest.z - currentZ;
        const dist = dx * dx + dy * dy + dz * dz;

        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      // Move to nearest chest
      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      currentX = nearest.x;
      currentY = nearest.y;
      currentZ = nearest.z;
    }

    return optimized;
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
    
    const items = chest.containerItems().map((item) => {
      const baseItem = {
        slot: item.slot,
        itemId: item.name,
        itemName: item.displayName,
        count: item.count,
        nbt: item.nbt || null,
        isShulkerBox: false,
        shulkerContents: [] as { slot: number; itemId: string; itemName: string; count: number }[],
      };

      // Check if this is a shulker box (any color variant)
      if (item.name.includes('shulker_box')) {
        baseItem.isShulkerBox = true;
        const contents = this.parseShulkerContents(item);
        if (contents.length > 0) {
          baseItem.shulkerContents = contents;
        }
      }

      return baseItem;
    });

    // Wait a bit before closing
    await this.sleep(100);
    chest.close();

    return items;
  }

  /**
   * Parse shulker box contents from either new data components (1.20.5+) or legacy NBT format
   */
  private parseShulkerContents(item: any): { slot: number; itemId: string; itemName: string; count: number }[] {
    const contents: { slot: number; itemId: string; itemName: string; count: number }[] = [];
    
    // Method 1: New data components format (Minecraft 1.20.5+)
    // item.components is an array containing { type: "container", data: { contents: [...] } }
    if (item.components && Array.isArray(item.components)) {
      const containerComponent = item.components.find((c: any) => c.type === 'container');
      
      if (containerComponent?.data?.contents) {
        const containerContents = containerComponent.data.contents;
        
        for (let slotIndex = 0; slotIndex < containerContents.length; slotIndex++) {
          const slotData = containerContents[slotIndex];
          
          // Skip empty slots (itemCount === 0 or missing itemId)
          if (!slotData.itemCount || slotData.itemCount === 0) {
            continue;
          }
          
          const numericId = slotData.itemId;
          const count = slotData.itemCount;
          
          // Resolve numeric ID to item name using the bot's registry
          let itemId = `unknown_${numericId}`;
          let itemName = `Unknown Item (${numericId})`;
          
          if (this.bot?.registry?.items?.[numericId]) {
            const registryItem = this.bot.registry.items[numericId];
            itemId = registryItem.name || itemId;
            itemName = registryItem.displayName || this.formatItemName(itemId);
          }
          
          contents.push({
            slot: slotIndex,
            itemId,
            itemName,
            count,
          });
        }
        
        return contents;
      }
    }
    
    // Method 2: Legacy NBT format (pre-1.20.5)
    // item.nbt contains BlockEntityTag.Items array
    if (item.nbt) {
      try {
        const nbtData = item.nbt as any;
        
        // Try to find Items list in various NBT structures
        let itemsList: any[] = [];
        
        // Standard format: BlockEntityTag.Items
        const blockEntityTag = 
          nbtData?.value?.BlockEntityTag?.value || 
          nbtData?.BlockEntityTag?.value ||
          nbtData?.value?.BlockEntityTag ||
          nbtData?.BlockEntityTag;
        
        if (blockEntityTag) {
          itemsList = blockEntityTag?.Items?.value || blockEntityTag?.Items || [];
        }
        
        // Alternative: direct Items at root
        if (itemsList.length === 0) {
          itemsList = nbtData?.value?.Items?.value || nbtData?.Items || [];
        }
        
        for (const nbtItem of itemsList) {
          const slotValue = nbtItem?.Slot?.value ?? nbtItem?.Slot ?? 0;
          const idValue: string = nbtItem?.id?.value ?? nbtItem?.id ?? '';
          const countValue = nbtItem?.Count?.value ?? nbtItem?.Count ?? 1;
          
          if (!idValue) continue;
          
          const cleanId = idValue.replace('minecraft:', '');
          const displayName = this.formatItemName(cleanId);
          
          contents.push({
            slot: slotValue,
            itemId: cleanId,
            itemName: displayName,
            count: countValue,
          });
        }
      } catch (err) {
        console.error('Failed to parse shulker box NBT:', err);
      }
    }
    
    return contents;
  }

  /**
   * Convert snake_case item ID to Title Case display name
   */
  private formatItemName(itemId: string): string {
    return itemId
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

      const rawChests = this.findChestsInRadius(
        storage.centerX,
        storage.centerY,
        storage.centerZ,
        storage.radius
      );

      // Use dynamic nearest-neighbor: pick closest chest after each visit
      const remainingChests = [...rawChests];
      const totalChests = remainingChests.length;

      console.log(`Found ${totalChests} chests in storage ${storageId}`);

      // Clear existing chest data
      await prisma.chest.deleteMany({
        where: { storageSystemId: storageId },
      });

      // Index each chest - dynamically picking the nearest one each time
      let indexed = 0;
      while (remainingChests.length > 0) {
        // Check if indexing was cancelled
        if (this.indexingCancelled) {
          console.log(`[Bot ${this.id}] Indexing stopped by user at ${indexed}/${totalChests} chests`);
          break;
        }

        // Get bot's CURRENT position and find nearest unvisited chest
        const botPos = this.bot!.entity.position;
        let nearestIdx = 0;
        let nearestDist = Infinity;

        for (let i = 0; i < remainingChests.length; i++) {
          const chest = remainingChests[i];
          const dx = chest.x - botPos.x;
          const dy = (chest.y - botPos.y) * 0.3; // Weight Y even less - vertical movement is cheap
          const dz = chest.z - botPos.z;
          const dist = dx * dx + dy * dy + dz * dz;

          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = i;
          }
        }

        // Remove the nearest chest from remaining and process it
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
                  isShulkerBox: item.isShulkerBox,
                  shulkerContents: item.isShulkerBox && item.shulkerContents.length > 0
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
      this.currentIndexingStorageId = null;
      this.status.currentAction = undefined;
      this.emitStatus();
    }
  }

  stopIndexing(): boolean {
    if (!this.isIndexing) {
      return false;
    }
    console.log(`[Bot ${this.id}] Stopping indexing...`);
    this.indexingCancelled = true;
    return true;
  }

  getCurrentIndexingStorageId(): string | null {
    return this.currentIndexingStorageId;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Look at a position with force=true and verify the look completed.
   * Retries if the look didn't register properly.
   */
  private async lookAtWithRetry(position: Vec3, maxRetries: number = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const beforeYaw = this.bot!.entity.yaw;
      const beforePitch = this.bot!.entity.pitch;
      
      await this.bot!.lookAt(position, true);
      await this.bot!.waitForTicks(3);
      
      const afterYaw = this.bot!.entity.yaw;
      const afterPitch = this.bot!.entity.pitch;
      
      const yawChanged = Math.abs(beforeYaw - afterYaw) > 0.01 || Math.abs(afterYaw) < 0.01;
      const pitchChanged = Math.abs(beforePitch - afterPitch) > 0.01;
      
      if (yawChanged || pitchChanged || attempt > 1) {
        return true;
      }
      
      await this.sleep(50);
    }
    return false;
  }

  /**
   * Find shulkers in inventory that contain any of the requested items.
   */
  private findShulkersContainingItems(requestedItems: Map<string, number>): any[] {
    if (!this.bot) return [];
    
    const requestedItemNames = new Set(requestedItems.keys());
    const result: any[] = [];
    
    const shulkersInInventory = this.getInventoryItems().filter((slot: any) => 
      slot.name.includes('shulker_box')
    );
    
    for (const shulker of shulkersInInventory) {
      const contents = this.parseShulkerContents(shulker);
      
      // If no specific items requested, any shulker with contents qualifies
      if (requestedItemNames.size === 0) {
        if (contents.length > 0) {
          result.push(shulker);
        }
        continue;
      }
      
      // Check if this shulker contains any of the requested items
      const hasRequestedItem = contents.some(content => 
        requestedItemNames.has(content.itemId) || 
        requestedItemNames.has(`minecraft:${content.itemId}`)
      );
      
      if (hasRequestedItem) {
        result.push(shulker);
      }
    }
    
    return result;
  }

  /**
   * Wait for a dropped item entity to appear nearby and collect it.
   */
  private async collectNearbyDroppedItem(itemNameContains: string, timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    const botPos = this.bot!.entity.position;
    
    const findDroppedItems = () => {
      return Object.values(this.bot!.entities).filter((e: any) => {
        const isItemEntity = 
          e.name === 'item' || 
          e.name === 'item_stack' ||
          e.entityType === 'item' ||
          (e.type === 'object' && e.objectType === 'Item') ||
          e.mobType === 'Item';
        
        if (!isItemEntity) return false;
        return e.position.distanceTo(botPos) < 8;
      });
    };
    
    while (Date.now() - startTime < timeoutMs) {
      // Check if already in inventory
      if (this.findShulkerInInventory()) return true;
      
      const nearbyItems = findDroppedItems();
      
      if (nearbyItems.length > 0) {
        const nearest = nearbyItems.reduce((a: any, b: any) => 
          a.position.distanceTo(botPos) < b.position.distanceTo(botPos) ? a : b
        ) as any;
        
        const distToItem = nearest.position.distanceTo(this.bot!.entity.position);
        
        if (distToItem > 1.5) {
          try {
            const { GoalNear } = require('mineflayer-pathfinder').goals;
            await this.bot!.pathfinder.goto(new GoalNear(nearest.position.x, nearest.position.y, nearest.position.z, 1));
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
        if (this.findShulkerInInventory()) return true;
      }
      
      await this.sleep(100);
    }
    
    return !!this.findShulkerInInventory();
  }

  setMicrosoftEmail(email: string): void {
    this.microsoftEmail = email;
  }

  getMineflayerBot(): Bot | null {
    return this.bot;
  }

  // ============ TASK EXECUTION ============

  /**
   * Get all non-null items from inventory slots
   */
  private getInventoryItems(): any[] {
    return this.bot!.inventory.slots.filter((s: any) => s !== null);
  }

  /**
   * Count total of a specific item in inventory
   */
  private countItemInInventory(itemName: string): number {
    return this.getInventoryItems()
      .filter((s: any) => s.name === itemName)
      .reduce((sum: number, s: any) => sum + s.count, 0);
  }

  /**
   * Find a shulker box in inventory
   */
  private findShulkerInInventory(): any | null {
    return this.bot!.inventory.slots.find((s: any) => s && s.name.includes('shulker_box')) || null;
  }

  cancelCurrentTask(taskId: string): void {
    if (this.currentTaskId === taskId) {
      this.taskCancelled = true;
    }
  }

  async executeTask(task: any): Promise<void> {
    if (!this.bot || !this.status.spawned) {
      throw new Error('Bot not connected');
    }

    this.currentTaskId = task.id;
    this.taskCancelled = false;

    console.log(`[Task ${task.id}] Executing: ${task.items?.length || 0} items, method: ${task.deliveryMethod}`);

    try {
      // Always collect items first (handles both direct chest items AND items from inside shulkers)
      const collectedItems = await this.collectTaskItems(task);

      if (this.taskCancelled) {
        throw new Error('Task cancelled');
      }

      // Check if we collected anything
      const totalCollected = Array.from(collectedItems.values()).reduce((sum, count) => sum + count, 0);
      console.log(`[Task ${task.id}] Collected ${totalCollected} items total`);
      
      if (totalCollected === 0) {
        // No items were collected - fail the task
        const expectedItems = task.items
          .filter((i: any) => i.status !== 'skipped')
          .map((i: any) => i.itemName)
          .join(', ');
        throw new Error(`Failed to collect any items. Expected: ${expectedItems}`);
      }

      // Deliver based on method
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
          // Deliver packed shulkers to chest
          const shulkersForChest = this.findShulkersContainingItems(collectedItems);
          if (shulkersForChest.length === 0) {
            shulkersForChest.push(...this.getInventoryItems().filter((s: any) => s.name.includes('shulker_box')));
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
      this.status.currentAction = undefined;
      this.emitStatus();
    }
  }

  private async collectTaskItems(task: any): Promise<Map<string, number>> {
    const collected = new Map<string, number>();

    // Build a map of all items we need to collect
    const itemsNeeded = new Map<string, { item: any; remaining: number }>();
    for (const item of task.items) {
      if (item.status === 'skipped') continue;
      const locations = item.sourceLocations as any[];
      if (!locations || locations.length === 0) continue;
      
      const remaining = item.userDecision === 'take_available'
        ? Math.min(item.requestedCount, locations.reduce((sum: number, l: any) => sum + l.available, 0))
        : item.requestedCount;
      itemsNeeded.set(item.id, { item, remaining });
    }

    if (itemsNeeded.size === 0) return collected;

    // Separate direct chest items from shulker sources
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

    // Sort chest plans by distance for optimal pathing
    const botPos = this.bot!.entity.position;
    const sortedChests = Array.from(chestPlans.values()).sort((a, b) => {
      const distA = Math.sqrt((a.x - botPos.x) ** 2 + (a.y - botPos.y) ** 2 + (a.z - botPos.z) ** 2);
      const distB = Math.sqrt((b.x - botPos.x) ** 2 + (b.y - botPos.y) ** 2 + (b.z - botPos.z) ** 2);
      return distA - distB;
    });

    // Visit each chest once and collect all needed items
    for (const chestPlan of sortedChests) {
      if (this.taskCancelled) break;

      // Check if we still need anything from this chest
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
        await this.sleep(200);

        const block = this.bot!.blockAt(new Vec3(chestPlan.x, chestPlan.y, chestPlan.z));
        if (!block) continue;

        const chest = await this.bot!.openContainer(block);
        await this.sleep(100);

        // Track what we're withdrawing from this chest
        const withdrawnFromChest: { slotInfo: any; actualTake: number }[] = [];

        // Collect direct items from this chest
        for (const slotInfo of directToCollect) {
          if (this.taskCancelled) break;

          const needed = itemsNeeded.get(slotInfo.requestItemId);
          if (!needed || needed.remaining <= 0) continue;

          const toTake = Math.min(needed.remaining, slotInfo.available);
          if (toTake <= 0) continue;

          const chestItem = chest.containerItems().find((i) => i.slot === slotInfo.slot);
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

        // Close the chest BEFORE verifying inventory
        if (shulkerToCollect.length === 0) {
          chest.close();
          await this.sleep(300);
          
          // Update database and collected counts
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
            await this.updateItemProgress(task.id, slotInfo.requestItemId, slotInfo.itemId, actualTake, itemsNeeded.get(slotInfo.requestItemId)?.remaining || 0, task.storageSystemId);
          }
          
          await this.sleep(200);
          continue;
        }

        // Update DB and collected counts for direct items when shulkers also need processing
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
          await this.updateItemProgress(task.id, slotInfo.requestItemId, slotInfo.itemId, actualTake, itemsNeeded.get(slotInfo.requestItemId)?.remaining || 0, task.storageSystemId);
        }

        // Group shulker slots by the shulker they're in
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
          const shulkerInChest = chest.containerItems().find((i) => 
            i.slot === shulkerSlot && i.name.includes('shulker_box')
          );

          if (!shulkerInChest) continue;

          const shulkerOriginalSlot = shulkerInChest.slot;
          await chest.withdraw(shulkerInChest.type, null, 1);
          await this.sleep(100);
          chest.close();
          await this.sleep(200);

          // Place the shulker
          const placePos = await this.findPlaceableSpot();
          if (!placePos) {
            const chestAgain = await this.bot!.openContainer(block);
            const shulkerInv = this.findShulkerInInventory();
            if (shulkerInv) {
              await chestAgain.deposit(shulkerInv.type, null, 1);
            }
            chestAgain.close();
            continue;
          }

          const shulkerInInventory = this.findShulkerInInventory();
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

          // Open the placed shulker and take items
          const placedShulker = this.bot!.blockAt(placePos);
          if (placedShulker?.name.includes('shulker_box')) {
            const shulkerContainer = await this.bot!.openContainer(placedShulker);
            await this.sleep(100);

            for (const slotInfo of slotsStillNeeded) {
              if (this.taskCancelled) break;

              const needed = itemsNeeded.get(slotInfo.requestItemId);
              if (!needed || needed.remaining <= 0) continue;

              const toTake = Math.min(needed.remaining, slotInfo.available);
              if (toTake <= 0) continue;

              const itemInShulker = shulkerContainer.containerItems().find((i) => i.slot === slotInfo.slotInShulker);
              if (itemInShulker && itemInShulker.name === slotInfo.itemId) {
                const actualTake = Math.min(toTake, itemInShulker.count);
                await shulkerContainer.withdraw(itemInShulker.type, null, actualTake);
                needed.remaining -= actualTake;
                collected.set(slotInfo.itemId, (collected.get(slotInfo.itemId) || 0) + actualTake);

                if (slotInfo.shulkerContentId) {
                  const newCount = slotInfo.available - actualTake;
                  if (newCount <= 0) {
                    await prisma.shulkerContent.delete({ where: { id: slotInfo.shulkerContentId } }).catch(() => {});
                  } else {
                    await prisma.shulkerContent.update({ where: { id: slotInfo.shulkerContentId }, data: { count: newCount } }).catch(() => {});
                  }
                }

                await this.updateItemProgress(task.id, slotInfo.requestItemId, slotInfo.itemId, actualTake, needed.remaining, task.storageSystemId);
                await this.sleep(50);
              }
            }

            shulkerContainer.close();
            await this.sleep(300);
            
            // Break shulker and collect it
            await this.bot!.dig(placedShulker);
            await this.collectNearbyDroppedItem('shulker_box', 3000);
            
            const shulkerInInv = this.findShulkerInInventory();
            if (!shulkerInInv) {
              await this.sleep(500);
              continue;
            }

            // Return shulker to chest
            await this.moveToBlock(chestPlan.x, chestPlan.y, chestPlan.z);
            await this.sleep(200);

            const chestAgain = await this.bot!.openContainer(block);
            await this.sleep(100);

            const shulkerToReturn = this.findShulkerInInventory();
            if (shulkerToReturn) {
              await chestAgain.deposit(shulkerToReturn.type, null, 1);
              await this.sleep(100);
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
    
    for (const item of this.getInventoryItems()) {
      if (this.taskCancelled) break;
      
      if (!itemsToDeliver.has(item.name)) continue;
      
      const neededCount = items.get(item.name) || 0;
      if (neededCount <= 0) continue;
      
      const tossCount = Math.min(item.count, neededCount);
      
      // Look at player before tossing
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

    const chestBlock = await this.findNearbyEmptyChest(task.deliveryX, task.deliveryY, task.deliveryZ);
    if (!chestBlock) {
      throw new Error('No empty chest found within 4 blocks of delivery location');
    }

    await this.updateTaskStep(task.id, 'Depositing items...');
    await this.moveToBlock(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z);
    await this.sleep(200);

    const chest = await this.bot!.openContainer(chestBlock);
    await this.sleep(100);

    const itemsToDeliver = new Set(items.keys());
    
    for (const item of this.getInventoryItems()) {
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
    
    // Get packable items (items to pack that aren't shulkers)
    const getPackableItems = () => {
      return this.getInventoryItems().filter((item: any) => {
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
      
      // Get the empty shulker from chest
      await this.moveToBlock(shulkerItem.chest.x, shulkerItem.chest.y, shulkerItem.chest.z);
      await this.sleep(200);

      const chestBlock = this.bot!.blockAt(new Vec3(shulkerItem.chest.x, shulkerItem.chest.y, shulkerItem.chest.z));
      if (!chestBlock) { shulkerIndex++; continue; }

      const chest = await this.bot!.openContainer(chestBlock);
      await this.sleep(100);

      const shulkerInChest = chest.containerItems().find(i => 
        i.slot === shulkerItem.slot && i.name.includes('shulker_box')
      );

      if (!shulkerInChest) {
        chest.close();
        shulkerIndex++;
        continue;
      }

      await chest.withdraw(shulkerInChest.type, null, 1);
      chest.close();
      await this.sleep(200);

      // Remove from database
      await prisma.chestItem.delete({ where: { id: shulkerItem.id } }).catch(() => {});

      // Find a place to put the shulker
      const placePos = await this.findPlaceableSpot();
      if (!placePos) { shulkerIndex++; continue; }

      const shulkerInInv = this.findShulkerInInventory();
      if (!shulkerInInv) { shulkerIndex++; continue; }

      await this.bot!.equip(shulkerInInv, 'hand');
      await this.sleep(100);

      const referenceBlock = this.bot!.blockAt(placePos.offset(0, -1, 0));
      if (!referenceBlock) { shulkerIndex++; continue; }
      
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

      // Open shulker and pack items
      const shulkerContainer = await this.bot!.openContainer(placedShulker);
      await this.sleep(200);
      
      await this.updateTaskStep(task.id, `Packing items into shulker ${shulkerIndex + 1}...`);
      packableItems = getPackableItems();
      
      // Deposit items into shulker
      for (const item of packableItems) {
        if (this.taskCancelled) break;
        
        const remainingToPack = itemsToPack.get(item.name) || 0;
        if (remainingToPack <= 0) continue;
        
        const depositCount = Math.min(item.count, remainingToPack);
        const beforeCount = this.countItemInInventory(item.name);
        
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
          
          const actualDeposited = beforeCount - this.countItemInInventory(item.name);
          if (actualDeposited > 0) {
            itemsToPack.set(item.name, remainingToPack - actualDeposited);
          }
        } catch {
          break; // Shulker full
        }
      }

      shulkerContainer.close();
      await this.sleep(300);

      // Break shulker to pick it up
      const shulkerToBreak = this.bot!.blockAt(placePos);
      if (shulkerToBreak?.name.includes('shulker_box')) {
        await this.bot!.dig(shulkerToBreak);
        await this.sleep(300);
        
        if (!this.findShulkerInInventory()) {
          await this.collectNearbyDroppedItem('shulker_box', 3000);
          await this.sleep(500);
        }
      }

      shulkerIndex++;
      packableItems = getPackableItems();
      if (packableItems.length === 0) break;
    }
    
    // Deliver shulkers to player if targetPlayer is set
    if (task.targetPlayer) {
      let shulkersToDeliver = this.findShulkersContainingItems(itemsToPack);
      
      // Fallback: if no shulkers found via parsing, try any shulker
      if (shulkersToDeliver.length === 0) {
        shulkersToDeliver = this.getInventoryItems().filter((s: any) => s.name.includes('shulker_box'));
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
            } catch { /* ignore toss errors */ }
            await this.sleep(150);
          }
          
          // Move back to avoid picking up dropped shulkers
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

  private async findNearbyEmptyChest(x: number, y: number, z: number): Promise<any> {
    if (!this.bot) return null;

    const chestId = this.bot.registry.blocksByName.chest?.id;
    if (!chestId) return null;

    const positions = this.bot.findBlocks({
      matching: chestId,
      maxDistance: 4,
      count: 10,
      point: new Vec3(x, y, z),
    });

    for (const pos of positions) {
      const block = this.bot.blockAt(pos);
      if (!block) continue;

      // Check if chest is empty by opening it
      try {
        await this.moveToBlock(pos.x, pos.y, pos.z);
        const chest = await this.bot.openContainer(block);
        const isEmpty = chest.containerItems().length === 0;
        chest.close();

        if (isEmpty) {
          return block;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Find a suitable spot to place a shulker box.
   * Scans for solid blocks with 2 air blocks above in a radius around the bot.
   */
  private async findPlaceableSpot(): Promise<Vec3 | null> {
    if (!this.bot) return null;

    const botPos = this.bot.entity.position;
    const maxDistance = 4;

    const solidBlock = this.bot.findBlock({
      point: botPos,
      maxDistance: maxDistance,
      matching: (block) => {
        if (!block || block.boundingBox !== 'block') return false;
        if (block.name.includes('chest') || block.name.includes('shulker') || block.name.includes('barrel')) return false;
        return true;
      },
      useExtraInfo: (block) => {
        const blockAbove1 = this.bot!.blockAt(block.position.offset(0, 1, 0));
        if (!blockAbove1 || blockAbove1.name !== 'air') return false;
        
        const blockAbove2 = this.bot!.blockAt(block.position.offset(0, 2, 0));
        if (!blockAbove2 || blockAbove2.name !== 'air') return false;
        
        const placePos = block.position.offset(0, 1, 0);
        const botFeet = this.bot!.entity.position.floored();
        if (placePos.x === botFeet.x && placePos.z === botFeet.z && 
            Math.abs(placePos.y - botFeet.y) < 2) {
          return false;
        }
        
        return true;
      }
    });

    if (solidBlock) {
      return solidBlock.position.offset(0, 1, 0);
    }

    return null;
  }

  private async updateTaskStep(taskId: string, step: string): Promise<void> {
    this.status.currentAction = step;
    this.emitStatus();

    await prisma.requestTask.update({
      where: { id: taskId },
      data: { currentStep: step },
    });

    emitToBot(this.id, 'task:step', { taskId, step });
  }
}

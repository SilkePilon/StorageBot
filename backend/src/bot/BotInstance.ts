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
        
        // Parse shulker box contents - supports both new (1.20.5+) and legacy formats
        const contents = this.parseShulkerContents(item);
        if (contents.length > 0) {
          baseItem.shulkerContents = contents;
          console.log(`[Shulker] ${item.name} has ${contents.length} item types`);
        } else {
          console.log(`[Shulker] ${item.name} is empty`);
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
          } else {
            // Fallback: format the numeric ID as best we can
            console.log(`[Shulker] Could not resolve item ID ${numericId} in registry`);
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
        totalChests,
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

  // ============ TASK EXECUTION ============

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

    console.log(`[Task ${task.id}] Executing task with ${task.items?.length || 0} items, deliveryMethod: ${task.deliveryMethod}`);
    console.log(`[Task ${task.id}] Items:`, JSON.stringify(task.items?.map((i: any) => ({ 
      id: i.id, 
      itemId: i.itemId, 
      status: i.status, 
      sourceLocationsCount: i.sourceLocations?.length,
      requestedCount: i.requestedCount 
    })), null, 2));

    try {
      // Always collect items first (handles both direct chest items AND items from inside shulkers)
      const collectedItems = await this.collectTaskItems(task);

      console.log(`[Task ${task.id}] Collected items:`, Array.from(collectedItems.entries()));

      if (this.taskCancelled) {
        throw new Error('Task cancelled');
      }

      // Check if we collected anything
      const totalCollected = Array.from(collectedItems.values()).reduce((sum, count) => sum + count, 0);
      
      console.log(`[Task ${task.id}] Total collected: ${totalCollected}`);
      
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
          // Pack collected items into selected shulkers, then deliver to player
          await this.packItemsIntoShulkers(task, collectedItems);
          await this.deliverToPlayer(task, collectedItems);
          break;
        case 'SHULKER_CHEST':
          // Pack collected items into selected shulkers, then deliver to chest
          await this.packItemsIntoShulkers(task, collectedItems);
          await this.deliverToChest(task, collectedItems);
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

    console.log(`[Task ${task.id}] Starting item collection for ${task.items.length} item types`);

    // Build a map of all items we need to collect, keyed by item.id
    const itemsNeeded = new Map<string, { item: any; remaining: number }>();
    for (const item of task.items) {
      if (item.status === 'skipped') continue;
      const locations = item.sourceLocations as any[];
      console.log(`[Task ${task.id}] Item ${item.itemName}: ${locations?.length || 0} source locations, fromShulker in any: ${locations?.some((l: any) => l.fromShulker)}`);
      
      if (!locations || locations.length === 0) {
        console.log(`[Task ${task.id}] WARNING: No source locations for item ${item.itemName}`);
        continue;
      }
      
      const remaining = item.userDecision === 'take_available'
        ? Math.min(item.requestedCount, locations.reduce((sum: number, l: any) => sum + l.available, 0))
        : item.requestedCount;
      itemsNeeded.set(item.id, { item, remaining });
    }

    console.log(`[Task ${task.id}] Items needed after filtering: ${itemsNeeded.size}`);
    if (itemsNeeded.size === 0) {
      console.log(`[Task ${task.id}] No items needed - returning empty`);
      return collected;
    }

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
      slot: number;           // Shulker's slot in the chest
      itemId: string;         // The item we want (not the shulker)
      requestItemId: string;
      chestItemId: string;    // Shulker's ChestItem.id
      available: number;
      fromShulker: true;
      shulkerContentId: string;
      slotInShulker: number;
      shulkerItemId: string;  // e.g., "purple_shulker_box"
    }

    type CollectSlot = DirectSlot | ShulkerSlot;

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
      
      if (!locations || locations.length === 0) {
        console.log(`[Task ${task.id}] Skipping item ${item.itemName} - no locations`);
        continue;
      }
      
      for (const loc of locations) {
        if (loc.x === undefined || loc.y === undefined || loc.z === undefined) {
          console.log(`[Task ${task.id}] Invalid location for ${item.itemName}:`, loc);
          continue;
        }
        
        const key = `${loc.x},${loc.y},${loc.z}`;
        if (!chestPlans.has(key)) {
          chestPlans.set(key, { x: loc.x, y: loc.y, z: loc.z, directSlots: [], shulkerSlots: [] });
        }
        
        if (loc.fromShulker) {
          console.log(`[Task ${task.id}] Adding shulker slot for ${item.itemName} at ${key}, shulker slot in chest: ${loc.slot}, item slot in shulker: ${loc.slotInShulker}`);
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

    console.log(`[Task ${task.id}] Chest plans: ${chestPlans.size} chests to visit`);
    for (const [key, plan] of chestPlans) {
      console.log(`[Task ${task.id}] Chest ${key}: ${plan.directSlots.length} direct, ${plan.shulkerSlots.length} shulker slots`);
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

        // First, collect direct items from this chest
        for (const slotInfo of directToCollect) {
          if (this.taskCancelled) break;

          const needed = itemsNeeded.get(slotInfo.requestItemId);
          if (!needed || needed.remaining <= 0) continue;

          const toTake = Math.min(needed.remaining, slotInfo.available);
          if (toTake <= 0) continue;

          const chestItem = chest.containerItems().find((i) => i.slot === slotInfo.slot);
          if (chestItem && chestItem.name === slotInfo.itemId) {
            const actualTake = Math.min(toTake, chestItem.count);
            await chest.withdraw(chestItem.type, null, actualTake);
            needed.remaining -= actualTake;
            collected.set(slotInfo.itemId, (collected.get(slotInfo.itemId) || 0) + actualTake);

            // Update database
            if (slotInfo.chestItemId) {
              const newCount = slotInfo.available - actualTake;
              if (newCount <= 0) {
                await prisma.chestItem.delete({ where: { id: slotInfo.chestItemId } }).catch(() => {});
              } else {
                await prisma.chestItem.update({ where: { id: slotInfo.chestItemId }, data: { count: newCount } }).catch(() => {});
              }
            }

            await this.updateItemProgress(task.id, slotInfo.requestItemId, slotInfo.itemId, actualTake, needed.remaining, task.storageSystemId);
            await this.sleep(50);
          }
        }

        // Now handle shulker extractions from this chest
        // Group shulker slots by the shulker they're in
        const shulkerGroups = new Map<string, ShulkerSlot[]>();
        for (const slot of shulkerToCollect) {
          const key = slot.chestItemId;
          if (!shulkerGroups.has(key)) {
            shulkerGroups.set(key, []);
          }
          shulkerGroups.get(key)!.push(slot);
        }

        for (const [shulkerChestItemId, slots] of shulkerGroups) {
          if (this.taskCancelled) break;

          // Check if we still need any items from this shulker
          const slotsStillNeeded = slots.filter((s) => {
            const needed = itemsNeeded.get(s.requestItemId);
            return needed && needed.remaining > 0;
          });

          if (slotsStillNeeded.length === 0) continue;

          // Find and take the shulker from the chest
          const shulkerSlot = slotsStillNeeded[0].slot;
          const shulkerInChest = chest.containerItems().find((i) => 
            i.slot === shulkerSlot && i.name.includes('shulker_box')
          );

          if (!shulkerInChest) {
            console.log(`[Task ${task.id}] Shulker not found in slot ${shulkerSlot}`);
            continue;
          }

          const shulkerOriginalSlot = shulkerInChest.slot;
          console.log(`[Task ${task.id}] Taking shulker from slot ${shulkerOriginalSlot} to extract items`);

          await chest.withdraw(shulkerInChest.type, null, 1);
          await this.sleep(100);
          chest.close();
          await this.sleep(200);

          // Place the shulker
          const placePos = await this.findPlaceableSpot();
          if (!placePos) {
            console.log(`[Task ${task.id}] No place to put shulker, skipping`);
            // Put shulker back
            const chestAgain = await this.bot!.openContainer(block);
            const shulkerInv = this.bot!.inventory.items().find((i) => i.name.includes('shulker_box'));
            if (shulkerInv) {
              await chestAgain.deposit(shulkerInv.type, null, 1);
            }
            chestAgain.close();
            continue;
          }

          const shulkerInInventory = this.bot!.inventory.items().find((i) => i.name.includes('shulker_box'));
          if (!shulkerInInventory) continue;

          await this.bot!.equip(shulkerInInventory, 'hand');
          await this.sleep(100);

          const referenceBlock = this.bot!.blockAt(placePos.offset(0, -1, 0));
          if (referenceBlock) {
            try {
              await this.bot!.placeBlock(referenceBlock, new Vec3(0, 1, 0));
              await this.sleep(400);
            } catch (placeErr) {
              console.log(`[Task ${task.id}] Failed to place shulker:`, placeErr);
              continue;
            }
          }

          // Open the placed shulker and take items
          const placedShulker = this.bot!.blockAt(placePos);
          if (placedShulker && placedShulker.name.includes('shulker_box')) {
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

                // Update ShulkerContent in database
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

            await this.sleep(100);
            shulkerContainer.close();
            await this.sleep(300);
            
            // Break the shulker to pick it up (inside the if block where placedShulker is validated)
            await this.bot!.dig(placedShulker);
            await this.sleep(500);

            // Put the shulker back in the chest
            await this.moveToBlock(chestPlan.x, chestPlan.y, chestPlan.z);
            await this.sleep(200);

            const chestAgain = await this.bot!.openContainer(block);
            await this.sleep(100);

            const shulkerToReturn = this.bot!.inventory.items().find((i) => i.name.includes('shulker_box'));
            if (shulkerToReturn) {
              // Try to put it in the original slot first
              const originalSlotItem = chestAgain.containerItems().find((i) => i.slot === shulkerOriginalSlot);
              
              if (!originalSlotItem) {
                // Original slot is empty, deposit there
                // Note: mineflayer deposit doesn't let you specify slot, so we just deposit
                await chestAgain.deposit(shulkerToReturn.type, null, 1);
              } else {
                // Original slot is taken, find next available
                await chestAgain.deposit(shulkerToReturn.type, null, 1);
              }

              // Update the shulker's slot in the database if it moved
              const newSlot = chestAgain.containerItems().find((i) => i.name.includes('shulker_box') && i.type === shulkerToReturn.type);
              if (newSlot && newSlot.slot !== shulkerOriginalSlot) {
                await prisma.chestItem.update({
                  where: { id: shulkerChestItemId },
                  data: { slot: newSlot.slot },
                }).catch(() => {});
              }
            }

            await this.sleep(100);
            chestAgain.close();
            await this.sleep(100);

            // Emit storage update
            emitToBot(this.id, 'storage:itemUpdated', {
              storageId: task.storageSystemId,
            });
          } else {
            console.log(`[Task ${task.id}] Failed to find placed shulker at ${placePos.x}, ${placePos.y}, ${placePos.z}`);
          }

          // Re-open chest to continue with other operations
          // Actually we need to close it first
          chestAgain.close();
          await this.sleep(200);

          // Reopen for any remaining operations
          const chestReopened = await this.bot!.openContainer(block);
          await this.sleep(100);
          // We're done with shulker extractions from this chest, close it
          chestReopened.close();
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

    // Find the player
    const player = this.bot!.players[task.targetPlayer];
    if (!player || !player.entity) {
      throw new Error(`Player ${task.targetPlayer} not found or not nearby`);
    }

    // Walk to player
    const playerPos = player.entity.position;
    await this.moveTo(playerPos.x, playerPos.y, playerPos.z);
    await this.sleep(500);

    await this.updateTaskStep(task.id, `Dropping items to ${task.targetPlayer}...`);

    // Only drop the collected task items (not bot's tools/food/etc)
    const itemsToDeliver = new Set(items.keys());
    for (const item of this.bot!.inventory.items()) {
      if (this.taskCancelled) break;
      // Only toss items that were part of the task collection
      if (itemsToDeliver.has(item.name)) {
        const neededCount = items.get(item.name) || 0;
        if (neededCount > 0) {
          const tossCount = Math.min(item.count, neededCount);
          await this.bot!.toss(item.type, null, tossCount);
          items.set(item.name, neededCount - tossCount);
          await this.sleep(100);
        }
      }
    }
  }

  private async deliverToChest(task: any, items: Map<string, number>): Promise<void> {
    if (task.deliveryX === null || task.deliveryY === null || task.deliveryZ === null) {
      throw new Error('No delivery location specified');
    }

    await this.updateTaskStep(task.id, 'Walking to delivery location...');

    // Move to delivery location
    await this.moveTo(task.deliveryX, task.deliveryY, task.deliveryZ);
    await this.sleep(500);

    // Find nearby empty chest
    const chestBlock = await this.findNearbyEmptyChest(task.deliveryX, task.deliveryY, task.deliveryZ);
    if (!chestBlock) {
      throw new Error('No empty chest found within 4 blocks of delivery location');
    }

    await this.updateTaskStep(task.id, 'Depositing items...');

    await this.moveToBlock(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z);
    await this.sleep(200);

    const chest = await this.bot!.openContainer(chestBlock);
    await this.sleep(100);

    // Only deposit the collected task items (not bot's tools/food/etc)
    const itemsToDeliver = new Set(items.keys());
    for (const item of this.bot!.inventory.items()) {
      if (this.taskCancelled) break;
      // Only deposit items that were part of the task collection
      if (itemsToDeliver.has(item.name)) {
        const neededCount = items.get(item.name) || 0;
        if (neededCount > 0) {
          const depositCount = Math.min(item.count, neededCount);
          try {
            await chest.deposit(item.type, null, depositCount);
            items.set(item.name, neededCount - depositCount);
            await this.sleep(100);
          } catch (error) {
            console.error(`Failed to deposit ${item.name}:`, error);
          }
        }
      }
    }
      }
    }

    await this.sleep(100);
    chest.close();
  }

  private async packItemsIntoShulkers(task: any, collectedItems: Map<string, number>): Promise<void> {
    if (!task.selectedShulkerIds || task.selectedShulkerIds.length === 0) {
      throw new Error('No shulkers selected for packing');
    }

    console.log(`[Task ${task.id}] Packing items into shulkers`);
    
    // Get empty shulker locations
    const shulkerItems = await prisma.chestItem.findMany({
      where: {
        id: { in: task.selectedShulkerIds },
      },
      include: {
        chest: true,
      },
    });

    if (shulkerItems.length === 0) {
      throw new Error('Selected shulkers not found in storage');
    }

    // Get all items in inventory to pack
    const inventoryItems = this.bot!.inventory.items();
    if (inventoryItems.length === 0) {
      console.log(`[Task ${task.id}] No items to pack`);
      return;
    }

    let shulkerIndex = 0;
    
    while (shulkerIndex < shulkerItems.length && inventoryItems.length > 0) {
      if (this.taskCancelled) break;

      const shulkerItem = shulkerItems[shulkerIndex];
      await this.updateTaskStep(task.id, `Getting shulker ${shulkerIndex + 1}/${shulkerItems.length} for packing...`);
      
      // Go get the empty shulker
      await this.moveToBlock(shulkerItem.chest.x, shulkerItem.chest.y, shulkerItem.chest.z);
      await this.sleep(200);

      const chestBlock = this.bot!.blockAt(new Vec3(shulkerItem.chest.x, shulkerItem.chest.y, shulkerItem.chest.z));
      if (!chestBlock) {
        shulkerIndex++;
        continue;
      }

      const chest = await this.bot!.openContainer(chestBlock);
      await this.sleep(100);

      // Find the shulker in the chest
      const shulkerInChest = chest.containerItems().find(i => 
        i.slot === shulkerItem.slot && i.name.includes('shulker_box')
      );

      if (!shulkerInChest) {
        console.log(`[Task ${task.id}] Shulker not found at expected slot`);
        chest.close();
        shulkerIndex++;
        continue;
      }

      // Take the shulker
      await chest.withdraw(shulkerInChest.type, null, 1);
      await this.sleep(100);
      chest.close();
      await this.sleep(200);

      // Delete the shulker from database as it's no longer in the chest
      await prisma.chestItem.delete({ where: { id: shulkerItem.id } }).catch(() => {});

      // Place the shulker
      const placePos = await this.findPlaceableSpot();
      if (!placePos) {
        console.log(`[Task ${task.id}] No place to put shulker`);
        shulkerIndex++;
        continue;
      }

      const shulkerInInv = this.bot!.inventory.items().find(i => i.name.includes('shulker_box'));
      if (!shulkerInInv) {
        shulkerIndex++;
        continue;
      }

      await this.bot!.equip(shulkerInInv, 'hand');
      await this.sleep(100);

      const referenceBlock = this.bot!.blockAt(placePos.offset(0, -1, 0));
      if (referenceBlock) {
        try {
          await this.bot!.placeBlock(referenceBlock, new Vec3(0, 1, 0));
          await this.sleep(400);
        } catch (placeErr) {
          console.log(`[Task ${task.id}] Failed to place shulker:`, placeErr);
          shulkerIndex++;
          continue;
        }
      }

      // Open and fill the shulker
      const placedShulker = this.bot!.blockAt(placePos);
      if (placedShulker && placedShulker.name.includes('shulker_box')) {
        const shulkerContainer = await this.bot!.openContainer(placedShulker);
        await this.sleep(100);

        await this.updateTaskStep(task.id, `Packing items into shulker ${shulkerIndex + 1}...`);

        // Deposit items into shulker (max 27 slots)
        const itemsToPack = this.bot!.inventory.items().filter(i => !i.name.includes('shulker_box'));
        for (const item of itemsToPack) {
          if (this.taskCancelled) break;
          try {
            await shulkerContainer.deposit(item.type, null, item.count);
            await this.sleep(50);
          } catch (e) {
            // Shulker might be full
            break;
          }
        }

        await this.sleep(100);
        shulkerContainer.close();
        await this.sleep(300);
      }

      // Break the shulker to pick it up (now filled)
      await this.bot!.dig(placedShulker!);
      await this.sleep(500);

      shulkerIndex++;

      // Check if we still have items to pack
      const remainingItems = this.bot!.inventory.items().filter(i => !i.name.includes('shulker_box'));
      if (remainingItems.length === 0) {
        console.log(`[Task ${task.id}] All items packed`);
        break;
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

  private async findPlaceableSpot(): Promise<Vec3 | null> {
    if (!this.bot) return null;

    const botPos = this.bot.entity.position.floored();

    // Check spots around the bot
    const offsets = [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ];

    for (const offset of offsets) {
      const checkPos = botPos.plus(offset);
      const blockAtPos = this.bot.blockAt(checkPos);
      const blockBelow = this.bot.blockAt(checkPos.offset(0, -1, 0));

      if (blockAtPos && blockAtPos.name === 'air' && blockBelow && blockBelow.boundingBox === 'block') {
        return checkPos;
      }
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

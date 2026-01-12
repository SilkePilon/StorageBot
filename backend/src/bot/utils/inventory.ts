import { Bot } from 'mineflayer';

/**
 * Shared inventory utilities for all bot types
 */

/**
 * Get all non-null items from inventory slots
 */
export function getInventoryItems(bot: Bot): any[] {
  return bot.inventory.slots.filter((s: any) => s !== null);
}

/**
 * Count total of a specific item in inventory
 */
export function countItemInInventory(bot: Bot, itemName: string): number {
  return getInventoryItems(bot)
    .filter((s: any) => s.name === itemName)
    .reduce((sum: number, s: any) => sum + s.count, 0);
}

/**
 * Find an item in inventory by name (partial match)
 */
export function findItemInInventory(bot: Bot, nameContains: string): any | null {
  return bot.inventory.slots.find((s: any) => 
    s && s.name.includes(nameContains)
  ) || null;
}

/**
 * Find a shulker box in inventory
 */
export function findShulkerInInventory(bot: Bot): any | null {
  return findItemInInventory(bot, 'shulker_box');
}

/**
 * Get empty slots count in inventory
 */
export function getEmptySlotCount(bot: Bot): number {
  return bot.inventory.slots.filter((s: any) => s === null).length;
}

/**
 * Check if inventory is full
 */
export function isInventoryFull(bot: Bot): boolean {
  return getEmptySlotCount(bot) === 0;
}

/**
 * Format item ID to display name (snake_case to Title Case)
 */
export function formatItemName(itemId: string): string {
  return itemId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse shulker box contents from either new data components (1.20.5+) or legacy NBT format
 */
export function parseShulkerContents(
  bot: Bot,
  item: any
): { slot: number; itemId: string; itemName: string; count: number }[] {
  const contents: { slot: number; itemId: string; itemName: string; count: number }[] = [];

  // Method 1: New data components format (Minecraft 1.20.5+)
  if (item.components && Array.isArray(item.components)) {
    const containerComponent = item.components.find((c: any) => c.type === 'container');

    if (containerComponent?.data?.contents) {
      const containerContents = containerComponent.data.contents;

      for (let slotIndex = 0; slotIndex < containerContents.length; slotIndex++) {
        const slotData = containerContents[slotIndex];

        if (!slotData.itemCount || slotData.itemCount === 0) {
          continue;
        }

        const numericId = slotData.itemId;
        const count = slotData.itemCount;

        let itemId = `unknown_${numericId}`;
        let itemName = `Unknown Item (${numericId})`;

        if (bot?.registry?.items?.[numericId]) {
          const registryItem = bot.registry.items[numericId];
          itemId = registryItem.name || itemId;
          itemName = registryItem.displayName || formatItemName(itemId);
        }

        contents.push({ slot: slotIndex, itemId, itemName, count });
      }

      return contents;
    }
  }

  // Method 2: Legacy NBT format (pre-1.20.5)
  if (item.nbt) {
    try {
      const nbtData = item.nbt as any;

      let itemsList: any[] = [];

      const blockEntityTag =
        nbtData?.value?.BlockEntityTag?.value ||
        nbtData?.BlockEntityTag?.value ||
        nbtData?.value?.BlockEntityTag ||
        nbtData?.BlockEntityTag;

      if (blockEntityTag) {
        itemsList = blockEntityTag?.Items?.value || blockEntityTag?.Items || [];
      }

      if (itemsList.length === 0) {
        itemsList = nbtData?.value?.Items?.value || nbtData?.Items || [];
      }

      for (const nbtItem of itemsList) {
        const slotValue = nbtItem?.Slot?.value ?? nbtItem?.Slot ?? 0;
        const idValue: string = nbtItem?.id?.value ?? nbtItem?.id ?? '';
        const countValue = nbtItem?.Count?.value ?? nbtItem?.Count ?? 1;

        if (!idValue) continue;

        const cleanId = idValue.replace('minecraft:', '');
        const displayName = formatItemName(cleanId);

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

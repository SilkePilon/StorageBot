import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

/**
 * Shared chest utilities for all bot types
 */

export interface ChestInfo {
  x: number;
  y: number;
  z: number;
  type: string; // 'chest', 'double_chest', 'trapped_chest', 'barrel'
}

/**
 * Find all chests/barrels in a radius around a point
 */
export function findChestsInRadius(
  bot: Bot,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number
): ChestInfo[] {
  const chestId = bot.registry.blocksByName.chest?.id;
  const trappedChestId = bot.registry.blocksByName.trapped_chest?.id;
  const barrelId = bot.registry.blocksByName.barrel?.id;

  const blockIds = [chestId, trappedChestId, barrelId].filter(Boolean) as number[];

  const positions = bot.findBlocks({
    matching: blockIds,
    maxDistance: radius,
    count: 1000,
    point: new Vec3(centerX, centerY, centerZ),
  });

  const processedPositions = new Set<string>();
  const results: ChestInfo[] = [];

  for (const pos of positions) {
    const posKey = `${pos.x},${pos.y},${pos.z}`;
    if (processedPositions.has(posKey)) continue;

    const block = bot.blockAt(pos);
    if (!block) continue;

    const blockName = block.name;
    let isDoubleChest = false;
    let otherHalfPos: Vec3 | null = null;

    if (blockName === 'chest' || blockName === 'trapped_chest') {
      const chestType = block.getProperties?.()?.type as string | undefined;
      const facing = block.getProperties?.()?.facing as string | undefined;

      if (chestType && chestType !== 'single' && facing) {
        isDoubleChest = true;
        let offsetX = 0,
          offsetZ = 0;

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

    processedPositions.add(posKey);

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
 * Find nearby empty chest within a distance
 */
export async function findNearbyEmptyChest(
  bot: Bot,
  x: number,
  y: number,
  z: number,
  maxDistance: number = 4
): Promise<any | null> {
  const chestId = bot.registry.blocksByName.chest?.id;
  if (!chestId) return null;

  const positions = bot.findBlocks({
    matching: chestId,
    maxDistance,
    count: 10,
    point: new Vec3(x, y, z),
  });

  for (const pos of positions) {
    const block = bot.blockAt(pos);
    if (!block) continue;

    let chest: any = null;
    try {
      // Look at the block center before opening - crucial for Minecraft interaction
      const blockCenter = block.position.offset(0.5, 0.5, 0.5);
      await bot.lookAt(blockCenter, true);
      await bot.waitForTicks(2);
      
      chest = await bot.openContainer(block);
      const isEmpty = chest.containerItems().length === 0;

      if (isEmpty) {
        chest.close();
        return block;
      }
    } catch {
      // Continue to next chest on error
    } finally {
      if (chest) {
        try {
          chest.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  return null;
}

/**
 * Find a suitable spot to place a shulker box.
 * Scans for solid blocks with 2 air blocks above in a radius around the bot.
 */
export function findPlaceableSpot(bot: Bot, maxDistance: number = 4): Vec3 | null {
  const botPos = bot.entity.position;

  const solidBlock = bot.findBlock({
    point: botPos,
    maxDistance,
    matching: (block) => {
      if (!block || block.boundingBox !== 'block') return false;
      if (block.name.includes('chest') || block.name.includes('shulker') || block.name.includes('barrel'))
        return false;
      return true;
    },
    useExtraInfo: (block) => {
      const blockAbove1 = bot.blockAt(block.position.offset(0, 1, 0));
      if (!blockAbove1 || blockAbove1.name !== 'air') return false;

      const blockAbove2 = bot.blockAt(block.position.offset(0, 2, 0));
      if (!blockAbove2 || blockAbove2.name !== 'air') return false;

      const placePos = block.position.offset(0, 1, 0);
      const botFeet = bot.entity.position.floored();
      if (placePos.x === botFeet.x && placePos.z === botFeet.z && Math.abs(placePos.y - botFeet.y) < 2) {
        return false;
      }

      return true;
    },
  });

  if (solidBlock) {
    return solidBlock.position.offset(0, 1, 0);
  }

  return null;
}

/**
 * Optimize chest visit order using nearest neighbor algorithm.
 */
export function optimizeChestPath(
  chests: ChestInfo[],
  startX: number,
  startY: number,
  startZ: number
): ChestInfo[] {
  if (chests.length <= 1) return chests;

  const optimized: ChestInfo[] = [];
  const remaining = [...chests];
  let currentX = startX;
  let currentY = startY;
  let currentZ = startZ;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const chest = remaining[i];
      const dx = chest.x - currentX;
      const dy = (chest.y - currentY) * 0.5;
      const dz = chest.z - currentZ;
      const dist = dx * dx + dy * dy + dz * dz;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    optimized.push(nearest);
    currentX = nearest.x;
    currentY = nearest.y;
    currentZ = nearest.z;
  }

  return optimized;
}

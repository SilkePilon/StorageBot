/**
 * @deprecated This file is kept for backwards compatibility.
 * New code should import from:
 * - BaseBotInstance for the base class
 * - types/storage/StorageBotInstance for storage-specific functionality
 */

// Re-export everything from the new modular structure
export { BaseBotInstance as BotInstance } from './BaseBotInstance.js';
export type { BotStatus, BotConnectionOptions, BotTypeConfig, SetupStep } from './BaseBotInstance.js';

// Re-export storage bot for backwards compatibility
export { StorageBotInstance } from './types/storage/index.js';

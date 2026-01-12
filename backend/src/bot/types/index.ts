/**
 * Bot Types Index
 * 
 * This file imports all bot type modules, which auto-register themselves
 * with the BotTypeRegistry when imported.
 * 
 * To add a new bot type:
 * 1. Create a new folder under types/ (e.g., types/farming/)
 * 2. Create the bot instance class extending BaseBotInstance
 * 3. Register the bot type in the module using botTypeRegistry.register()
 * 4. Import the module here
 */

// Import all bot types - they self-register on import
import './storage/index.js';

// Future bot types can be added here:
// import './farming/index.js';
// import './pvp/index.js';
// import './building/index.js';

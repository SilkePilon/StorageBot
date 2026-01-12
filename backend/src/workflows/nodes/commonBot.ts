/**
 * Common Bot Action Nodes
 * 
 * Actions available for all bot types (movement, chat, etc.)
 */

import { WorkflowNodeDefinition } from '../types.js';

export const commonBotNodes: WorkflowNodeDefinition[] = [
  {
    type: 'action.bot.connect',
    name: 'Connect Bot',
    description: 'Connect a bot to a Minecraft server',
    category: 'action',
    icon: 'Power',
    color: '#22c55e',
    inputs: [],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
    ],
  },
  {
    type: 'action.bot.disconnect',
    name: 'Disconnect Bot',
    description: 'Disconnect a bot from the server',
    category: 'action',
    icon: 'PowerOff',
    color: '#ef4444',
    inputs: [],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: { type: 'object' },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
    ],
  },
  {
    type: 'action.bot.moveTo',
    name: 'Move To',
    description: 'Move the bot to specific coordinates',
    category: 'action',
    icon: 'Navigation',
    color: '#3b82f6',
    inputs: [
      {
        id: 'coordinates',
        name: 'Coordinates',
        dataType: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
      },
    ],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            finalPosition: { type: 'object' },
          },
        },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
      {
        id: 'coordinates',
        name: 'Coordinates',
        description: 'Target position (or use input)',
        type: 'coordinates',
      },
    ],
  },
  {
    type: 'action.bot.chat',
    name: 'Send Chat',
    description: 'Send a chat message in-game',
    category: 'action',
    icon: 'MessageSquare',
    color: '#8b5cf6',
    inputs: [
      {
        id: 'message',
        name: 'Message',
        dataType: { type: 'string' },
      },
    ],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: { type: 'object' },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
      {
        id: 'message',
        name: 'Message',
        description: 'Chat message to send (supports $input variables)',
        type: 'text',
        required: true,
        placeholder: 'Hello, world!',
      },
    ],
  },
  {
    type: 'action.bot.eat',
    name: 'Eat Food',
    description: 'Make the bot eat food from inventory',
    category: 'action',
    icon: 'Apple',
    color: '#f59e0b',
    inputs: [],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            foodEaten: { type: 'string' },
            newFoodLevel: { type: 'number' },
          },
        },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
      {
        id: 'preferredFood',
        name: 'Preferred Food',
        description: 'Specific food item to eat (optional)',
        type: 'text',
        placeholder: 'golden_apple',
      },
      {
        id: 'minHunger',
        name: 'Min Hunger to Eat',
        description: 'Only eat if food level is below this',
        type: 'number',
        defaultValue: 18,
        validation: { min: 0, max: 20 },
      },
    ],
  },
  {
    type: 'action.bot.dropItems',
    name: 'Drop Items',
    description: 'Drop items from bot inventory',
    category: 'action',
    icon: 'PackageX',
    color: '#ef4444',
    inputs: [
      {
        id: 'itemId',
        name: 'Item ID',
        dataType: { type: 'string' },
      },
    ],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            dropped: { type: 'number' },
          },
        },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
      {
        id: 'itemId',
        name: 'Item ID',
        description: 'Minecraft item ID to drop (or use input)',
        type: 'text',
        placeholder: 'minecraft:cobblestone',
      },
      {
        id: 'count',
        name: 'Count',
        description: 'Number to drop (-1 for all)',
        type: 'number',
        defaultValue: -1,
      },
    ],
  },
  {
    type: 'action.bot.getStatus',
    name: 'Get Bot Status',
    description: 'Get the current status of a bot',
    category: 'action',
    icon: 'Activity',
    color: '#10b981',
    inputs: [],
    outputs: [
      {
        id: 'status',
        name: 'Status',
        dataType: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            spawned: { type: 'boolean' },
            health: { type: 'number' },
            food: { type: 'number' },
            position: { type: 'object' },
            dimension: { type: 'string' },
            currentAction: { type: 'string' },
          },
        },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
    ],
  },
  {
    type: 'action.bot.getInventory',
    name: 'Get Inventory',
    description: 'Get the bot inventory contents',
    category: 'action',
    icon: 'Backpack',
    color: '#10b981',
    inputs: [],
    outputs: [
      {
        id: 'items',
        name: 'Items',
        dataType: {
          type: 'array',
          itemType: {
            type: 'object',
            properties: {
              slot: { type: 'number' },
              itemId: { type: 'string' },
              count: { type: 'number' },
            },
          },
        },
      },
      {
        id: 'freeSlots',
        name: 'Free Slots',
        dataType: { type: 'number' },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
    ],
  },
  {
    type: 'action.bot.lookAt',
    name: 'Look At',
    description: 'Make the bot look at coordinates or a player',
    category: 'action',
    icon: 'Eye',
    color: '#6366f1',
    inputs: [
      {
        id: 'target',
        name: 'Target',
        dataType: { type: 'any' },
      },
    ],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: { type: 'object' },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
      {
        id: 'targetType',
        name: 'Target Type',
        type: 'select',
        defaultValue: 'coordinates',
        options: [
          { value: 'coordinates', label: 'Coordinates' },
          { value: 'player', label: 'Player' },
        ],
      },
      {
        id: 'coordinates',
        name: 'Coordinates',
        type: 'coordinates',
      },
      {
        id: 'playerName',
        name: 'Player Name',
        type: 'text',
        placeholder: 'Steve',
      },
    ],
  },
  {
    type: 'action.bot.follow',
    name: 'Follow Player',
    description: 'Make the bot follow a player',
    category: 'action',
    icon: 'Footprints',
    color: '#3b82f6',
    inputs: [],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: { type: 'object' },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
      {
        id: 'playerName',
        name: 'Player Name',
        type: 'text',
        required: true,
        placeholder: 'Steve',
      },
      {
        id: 'distance',
        name: 'Follow Distance',
        description: 'How close to follow',
        type: 'number',
        defaultValue: 2,
        validation: { min: 1, max: 10 },
      },
      {
        id: 'duration',
        name: 'Duration (seconds)',
        description: 'How long to follow (0 = until cancelled)',
        type: 'number',
        defaultValue: 30,
      },
    ],
  },
  {
    type: 'action.bot.stopMoving',
    name: 'Stop Moving',
    description: 'Stop all movement',
    category: 'action',
    icon: 'CircleStop',
    color: '#ef4444',
    inputs: [],
    outputs: [
      {
        id: 'result',
        name: 'Result',
        dataType: { type: 'object' },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        type: 'bot-select',
        required: true,
      },
    ],
  },
];

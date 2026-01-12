/**
 * Storage Bot Workflow Nodes
 * 
 * Dynamic workflow nodes for the Storage bot type.
 * These are registered when the storage bot type is loaded.
 */

import { BotTypeWorkflowNodes, WorkflowNodeDefinition } from '../../types.js';

export const storageBotWorkflowNodes: BotTypeWorkflowNodes = {
  botType: 'storage',
  
  // Events that storage bots emit (for triggers)
  events: [
    {
      id: 'indexing_started',
      name: 'Indexing Started',
      description: 'Triggered when storage indexing begins',
      payload: {
        type: 'object',
        properties: {
          storageId: { type: 'string' },
          storageName: { type: 'string' },
        },
      },
    },
    {
      id: 'indexing_progress',
      name: 'Indexing Progress',
      description: 'Triggered periodically during indexing',
      payload: {
        type: 'object',
        properties: {
          storageId: { type: 'string' },
          progress: { type: 'number', description: 'Progress percentage 0-100' },
          chestsIndexed: { type: 'number' },
          totalChests: { type: 'number' },
        },
      },
    },
    {
      id: 'indexing_complete',
      name: 'Indexing Complete',
      description: 'Triggered when storage indexing finishes',
      payload: {
        type: 'object',
        properties: {
          storageId: { type: 'string' },
          totalChests: { type: 'number' },
          totalItems: { type: 'number' },
          wasStopped: { type: 'boolean' },
        },
      },
    },
    {
      id: 'task_started',
      name: 'Task Started',
      description: 'Triggered when an item retrieval task begins',
      payload: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          taskName: { type: 'string' },
          itemCount: { type: 'number' },
          deliveryMethod: { type: 'string' },
        },
      },
    },
    {
      id: 'task_completed',
      name: 'Task Completed',
      description: 'Triggered when an item retrieval task finishes successfully',
      payload: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          itemsCollected: { type: 'number' },
          duration: { type: 'number', description: 'Duration in milliseconds' },
        },
      },
    },
    {
      id: 'task_failed',
      name: 'Task Failed',
      description: 'Triggered when an item retrieval task fails',
      payload: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          error: { type: 'string' },
        },
      },
    },
    {
      id: 'item_threshold',
      name: 'Item Threshold',
      description: 'Triggered when an item count crosses a threshold',
      payload: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          itemName: { type: 'string' },
          count: { type: 'number' },
          threshold: { type: 'number' },
          direction: { type: 'string', description: '"above" or "below"' },
        },
      },
    },
  ],
  
  // Actions that storage bots can perform
  actions: [
    {
      type: 'startIndexing',
      name: 'Start Indexing',
      description: 'Start indexing a storage system',
      category: 'action',
      icon: 'RefreshCw',
      color: '#3b82f6',
      inputs: [
        {
          id: 'storageId',
          name: 'Storage System ID',
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
              storageId: { type: 'string' },
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
          id: 'storageId',
          name: 'Storage System',
          description: 'Leave empty to use input',
          type: 'text',
          placeholder: 'Use input or enter ID',
        },
      ],
    },
    {
      type: 'stopIndexing',
      name: 'Stop Indexing',
      description: 'Stop an ongoing indexing operation',
      category: 'action',
      icon: 'StopCircle',
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
      type: 'createTask',
      name: 'Create Retrieval Task',
      description: 'Create a task to retrieve items from storage',
      category: 'action',
      icon: 'Package',
      color: '#3b82f6',
      inputs: [
        {
          id: 'items',
          name: 'Items',
          description: 'Array of items to retrieve',
          dataType: {
            type: 'array',
            itemType: {
              type: 'object',
              properties: {
                itemId: { type: 'string' },
                count: { type: 'number' },
              },
            },
          },
        },
      ],
      outputs: [
        {
          id: 'task',
          name: 'Created Task',
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
          id: 'storageId',
          name: 'Storage System ID',
          type: 'text',
          required: true,
        },
        {
          id: 'deliveryMethod',
          name: 'Delivery Method',
          type: 'select',
          required: true,
          defaultValue: 'DROP_TO_PLAYER',
          options: [
            { value: 'DROP_TO_PLAYER', label: 'Drop to Player' },
            { value: 'PUT_IN_CHEST', label: 'Put in Chest' },
            { value: 'SHULKER_DROP', label: 'Pack in Shulkers & Drop' },
            { value: 'SHULKER_CHEST', label: 'Pack in Shulkers & Store' },
          ],
        },
        {
          id: 'targetPlayer',
          name: 'Target Player',
          description: 'Minecraft username (for drop methods)',
          type: 'text',
        },
        {
          id: 'deliveryLocation',
          name: 'Delivery Location',
          description: 'Chest coordinates (for chest methods)',
          type: 'coordinates',
        },
      ],
    },
    {
      type: 'getStorageStats',
      name: 'Get Storage Stats',
      description: 'Get statistics about a storage system',
      category: 'action',
      icon: 'BarChart3',
      color: '#10b981',
      inputs: [],
      outputs: [
        {
          id: 'stats',
          name: 'Statistics',
          dataType: {
            type: 'object',
            properties: {
              totalSlots: { type: 'number' },
              usedSlots: { type: 'number' },
              freeSlots: { type: 'number' },
              totalItems: { type: 'number' },
              uniqueItemTypes: { type: 'number' },
              chestCount: { type: 'number' },
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
          id: 'storageId',
          name: 'Storage System ID',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      type: 'searchItems',
      name: 'Search Items',
      description: 'Search for items in storage',
      category: 'action',
      icon: 'Search',
      color: '#10b981',
      inputs: [
        {
          id: 'searchQuery',
          name: 'Search Query',
          dataType: { type: 'string' },
        },
      ],
      outputs: [
        {
          id: 'items',
          name: 'Found Items',
          dataType: {
            type: 'array',
            itemType: {
              type: 'object',
              properties: {
                itemId: { type: 'string' },
                itemName: { type: 'string' },
                totalCount: { type: 'number' },
                locations: { type: 'array' },
              },
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
          id: 'storageId',
          name: 'Storage System ID',
          type: 'text',
          required: true,
        },
        {
          id: 'searchQuery',
          name: 'Search Query',
          description: 'Item name to search (or use input)',
          type: 'text',
          placeholder: 'diamond',
        },
      ],
    },
    {
      type: 'checkItemCount',
      name: 'Check Item Count',
      description: 'Get the count of a specific item',
      category: 'action',
      icon: 'Hash',
      color: '#10b981',
      inputs: [
        {
          id: 'itemId',
          name: 'Item ID',
          dataType: { type: 'string' },
        },
      ],
      outputs: [
        {
          id: 'count',
          name: 'Item Count',
          dataType: { type: 'number' },
        },
        {
          id: 'item',
          name: 'Item Info',
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
          id: 'storageId',
          name: 'Storage System ID',
          type: 'text',
          required: true,
        },
        {
          id: 'itemId',
          name: 'Item ID',
          description: 'Minecraft item ID (or use input)',
          type: 'text',
          placeholder: 'minecraft:diamond',
        },
      ],
    },
  ] as WorkflowNodeDefinition[],
};

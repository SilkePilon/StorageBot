/**
 * Trigger Nodes
 * 
 * Nodes that start workflow execution.
 */

import { WorkflowNodeDefinition } from '../types.js';

export const triggerNodes: WorkflowNodeDefinition[] = [
  {
    type: 'trigger.manual',
    name: 'Manual Trigger',
    description: 'Start workflow manually via UI or API',
    category: 'trigger',
    icon: 'Play',
    color: '#8b5cf6',
    inputs: [],
    outputs: [
      {
        id: 'trigger',
        name: 'Trigger Data',
        description: 'Data passed when manually triggering',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'inputSchema',
        name: 'Input Schema (optional)',
        description: 'JSON schema for manual input form',
        type: 'json',
        defaultValue: '{}',
      },
    ],
    triggerEvents: ['manual'],
  },

  {
    type: 'trigger.schedule',
    name: 'Schedule',
    description: 'Run workflow on a schedule (cron)',
    category: 'trigger',
    icon: 'Clock',
    color: '#8b5cf6',
    inputs: [],
    outputs: [
      {
        id: 'trigger',
        name: 'Trigger Data',
        description: 'Timestamp and schedule info',
        dataType: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', description: 'ISO timestamp of trigger' },
            scheduledTime: { type: 'string', description: 'When it was scheduled to run' },
          },
        },
      },
    ],
    configFields: [
      {
        id: 'cronExpression',
        name: 'Schedule',
        type: 'cron',
        required: true,
        defaultValue: '0 * * * *', // Every hour
      },
      {
        id: 'timezone',
        name: 'Timezone',
        type: 'select',
        defaultValue: 'UTC',
        options: [
          { value: 'UTC', label: 'UTC' },
          { value: 'America/New_York', label: 'Eastern Time' },
          { value: 'America/Chicago', label: 'Central Time' },
          { value: 'America/Denver', label: 'Mountain Time' },
          { value: 'America/Los_Angeles', label: 'Pacific Time' },
          { value: 'Europe/London', label: 'London' },
          { value: 'Europe/Paris', label: 'Paris' },
          { value: 'Europe/Amsterdam', label: 'Amsterdam' },
          { value: 'Asia/Tokyo', label: 'Tokyo' },
          { value: 'Asia/Shanghai', label: 'Shanghai' },
          { value: 'Australia/Sydney', label: 'Sydney' },
        ],
      },
    ],
    triggerEvents: ['schedule'],
  },

  {
    type: 'trigger.botEvent',
    name: 'Bot Event',
    description: 'Trigger when a bot event occurs',
    category: 'trigger',
    icon: 'Zap',
    color: '#8b5cf6',
    inputs: [],
    outputs: [
      {
        id: 'event',
        name: 'Event Data',
        description: 'Data from the bot event',
        dataType: { type: 'any' },
      },
      {
        id: 'bot',
        name: 'Bot Info',
        description: 'Information about the bot',
        dataType: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
          },
        },
      },
    ],
    configFields: [
      {
        id: 'botId',
        name: 'Bot',
        description: 'Which bot to listen to (empty = all bots)',
        type: 'bot-select',
      },
      {
        id: 'eventCategory',
        name: 'Event Category',
        type: 'select',
        required: true,
        options: [
          { value: 'core', label: 'Core Events' },
          { value: 'bot-type', label: 'Bot Type Events' },
        ],
      },
      {
        id: 'coreEvent',
        name: 'Core Event',
        description: 'Core bot events (available for all bot types)',
        type: 'select',
        options: [
          { value: 'connected', label: 'Bot Connected' },
          { value: 'disconnected', label: 'Bot Disconnected' },
          { value: 'spawned', label: 'Bot Spawned' },
          { value: 'death', label: 'Bot Died' },
          { value: 'respawn', label: 'Bot Respawned' },
          { value: 'health_changed', label: 'Health Changed' },
          { value: 'chat_received', label: 'Chat Message Received' },
          { value: 'kicked', label: 'Bot Kicked' },
          { value: 'error', label: 'Error Occurred' },
        ],
      },
      {
        id: 'botTypeEvent',
        name: 'Bot Type Event',
        description: 'Events specific to the bot type',
        type: 'select',
        dynamicOptions: {
          source: 'bot-events',
        },
      },
      {
        id: 'filter',
        name: 'Event Filter (optional)',
        description: 'JSON filter conditions',
        type: 'json',
        defaultValue: '{}',
      },
    ],
    triggerEvents: ['bot_event'],
  },

  {
    type: 'trigger.webhook',
    name: 'Webhook',
    description: 'Trigger via HTTP webhook',
    category: 'trigger',
    icon: 'Webhook',
    color: '#8b5cf6',
    inputs: [],
    outputs: [
      {
        id: 'body',
        name: 'Request Body',
        dataType: { type: 'any' },
      },
      {
        id: 'headers',
        name: 'Headers',
        dataType: { type: 'object' },
      },
      {
        id: 'query',
        name: 'Query Parameters',
        dataType: { type: 'object' },
      },
    ],
    configFields: [
      {
        id: 'method',
        name: 'HTTP Method',
        type: 'select',
        defaultValue: 'POST',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
        ],
      },
      {
        id: 'requireAuth',
        name: 'Require Secret',
        description: 'Require X-Webhook-Secret header',
        type: 'boolean',
        defaultValue: true,
      },
    ],
    triggerEvents: ['webhook'],
  },
];

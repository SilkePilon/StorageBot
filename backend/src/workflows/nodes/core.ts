/**
 * Core Workflow Nodes
 * 
 * Logic, Data, and Utility nodes that are available for all workflows.
 */

import { WorkflowNodeDefinition } from '../types.js';

export const coreNodes: WorkflowNodeDefinition[] = [
  // ============ LOGIC NODES ============
  
  {
    type: 'logic.if',
    name: 'If Condition',
    description: 'Branch workflow based on a condition',
    category: 'logic',
    icon: 'GitBranch',
    color: '#f59e0b',
    inputs: [
      {
        id: 'input',
        name: 'Input',
        dataType: { type: 'any' },
        required: true,
      },
    ],
    outputs: [
      {
        id: 'true',
        name: 'True',
        dataType: { type: 'any' },
      },
      {
        id: 'false',
        name: 'False',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'field',
        name: 'Field to Check',
        description: 'JSON path to the field (e.g., "data.health")',
        type: 'text',
        required: true,
        placeholder: 'data.health',
      },
      {
        id: 'operator',
        name: 'Operator',
        type: 'select',
        required: true,
        defaultValue: 'eq',
        options: [
          { value: 'eq', label: 'Equals (==)' },
          { value: 'neq', label: 'Not Equals (!=)' },
          { value: 'gt', label: 'Greater Than (>)' },
          { value: 'gte', label: 'Greater Than or Equal (>=)' },
          { value: 'lt', label: 'Less Than (<)' },
          { value: 'lte', label: 'Less Than or Equal (<=)' },
          { value: 'contains', label: 'Contains' },
          { value: 'startsWith', label: 'Starts With' },
          { value: 'endsWith', label: 'Ends With' },
          { value: 'exists', label: 'Exists (not null/undefined)' },
          { value: 'notExists', label: 'Does Not Exist' },
          { value: 'isEmpty', label: 'Is Empty' },
          { value: 'isNotEmpty', label: 'Is Not Empty' },
        ],
      },
      {
        id: 'value',
        name: 'Compare Value',
        description: 'Value to compare against',
        type: 'text',
        placeholder: '10',
      },
    ],
  },

  {
    type: 'logic.switch',
    name: 'Switch',
    description: 'Route to different outputs based on value',
    category: 'logic',
    icon: 'Route',
    color: '#f59e0b',
    inputs: [
      {
        id: 'input',
        name: 'Input',
        dataType: { type: 'any' },
        required: true,
      },
    ],
    outputs: [
      { id: 'case_0', name: 'Case 1', dataType: { type: 'any' } },
      { id: 'case_1', name: 'Case 2', dataType: { type: 'any' } },
      { id: 'case_2', name: 'Case 3', dataType: { type: 'any' } },
      { id: 'default', name: 'Default', dataType: { type: 'any' } },
    ],
    configFields: [
      {
        id: 'field',
        name: 'Field to Check',
        type: 'text',
        required: true,
        placeholder: 'data.status',
      },
      {
        id: 'cases',
        name: 'Cases (JSON array)',
        description: 'Array of values to match',
        type: 'json',
        defaultValue: '["value1", "value2", "value3"]',
      },
    ],
  },

  {
    type: 'logic.loop',
    name: 'Loop',
    description: 'Iterate over an array or repeat N times',
    category: 'logic',
    icon: 'Repeat',
    color: '#f59e0b',
    inputs: [
      {
        id: 'items',
        name: 'Items / Count',
        description: 'Array to iterate or number of iterations',
        dataType: { type: 'any' },
        required: true,
      },
    ],
    outputs: [
      {
        id: 'item',
        name: 'Current Item',
        description: 'Current item in iteration',
        dataType: { type: 'any' },
      },
      {
        id: 'index',
        name: 'Index',
        description: 'Current iteration index (0-based)',
        dataType: { type: 'number' },
      },
      {
        id: 'done',
        name: 'Done',
        description: 'Triggered when loop completes',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'mode',
        name: 'Loop Mode',
        type: 'select',
        defaultValue: 'array',
        options: [
          { value: 'array', label: 'Iterate Array' },
          { value: 'count', label: 'Repeat N Times' },
        ],
      },
      {
        id: 'count',
        name: 'Repeat Count',
        description: 'Number of times to repeat (for count mode)',
        type: 'number',
        defaultValue: 3,
        validation: { min: 1, max: 10000 },
      },
      {
        id: 'arrayPath',
        name: 'Array Path',
        description: 'Path to array in input data (for array mode)',
        type: 'text',
        placeholder: 'data.items',
      },
    ],
  },

  {
    type: 'logic.merge',
    name: 'Merge',
    description: 'Combine multiple branches into one',
    category: 'logic',
    icon: 'Merge',
    color: '#f59e0b',
    inputs: [
      { id: 'input_1', name: 'Input 1', dataType: { type: 'any' } },
      { id: 'input_2', name: 'Input 2', dataType: { type: 'any' } },
      { id: 'input_3', name: 'Input 3', dataType: { type: 'any' } },
    ],
    outputs: [
      {
        id: 'output',
        name: 'Output',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'mode',
        name: 'Merge Mode',
        type: 'select',
        defaultValue: 'waitAll',
        options: [
          { value: 'waitAll', label: 'Wait for All' },
          { value: 'waitAny', label: 'Wait for Any' },
          { value: 'passThrough', label: 'Pass Through (first to arrive)' },
        ],
      },
    ],
  },

  // ============ DATA NODES ============

  {
    type: 'data.setVariable',
    name: 'Set Variable',
    description: 'Store a value in workflow context',
    category: 'data',
    icon: 'Variable',
    color: '#10b981',
    inputs: [
      {
        id: 'value',
        name: 'Value',
        dataType: { type: 'any' },
      },
    ],
    outputs: [
      {
        id: 'output',
        name: 'Output',
        description: 'Pass-through of input',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'variableName',
        name: 'Variable Name',
        type: 'text',
        required: true,
        placeholder: 'myVariable',
      },
      {
        id: 'valueExpression',
        name: 'Value Expression',
        description: 'Value to set (can reference input with $input)',
        type: 'text',
        placeholder: '$input.data.count',
      },
    ],
  },

  {
    type: 'data.transform',
    name: 'Transform',
    description: 'Transform data structure using expressions',
    category: 'data',
    icon: 'Wand2',
    color: '#10b981',
    inputs: [
      {
        id: 'input',
        name: 'Input',
        dataType: { type: 'any' },
        required: true,
      },
    ],
    outputs: [
      {
        id: 'output',
        name: 'Output',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'transformations',
        name: 'Transformations',
        description: 'JSON object mapping output fields to expressions',
        type: 'json',
        defaultValue: '{\n  "newField": "$input.data.oldField",\n  "calculated": "$input.data.value * 2"\n}',
      },
    ],
  },

  {
    type: 'data.filter',
    name: 'Filter Array',
    description: 'Filter array items based on condition',
    category: 'data',
    icon: 'Filter',
    color: '#10b981',
    inputs: [
      {
        id: 'array',
        name: 'Array',
        dataType: { type: 'array', itemType: { type: 'any' } },
        required: true,
      },
    ],
    outputs: [
      {
        id: 'filtered',
        name: 'Filtered',
        dataType: { type: 'array', itemType: { type: 'any' } },
      },
      {
        id: 'excluded',
        name: 'Excluded',
        dataType: { type: 'array', itemType: { type: 'any' } },
      },
    ],
    configFields: [
      {
        id: 'field',
        name: 'Field to Check',
        type: 'text',
        required: true,
        placeholder: 'item.count',
      },
      {
        id: 'operator',
        name: 'Operator',
        type: 'select',
        defaultValue: 'gt',
        options: [
          { value: 'eq', label: 'Equals' },
          { value: 'neq', label: 'Not Equals' },
          { value: 'gt', label: 'Greater Than' },
          { value: 'gte', label: 'Greater or Equal' },
          { value: 'lt', label: 'Less Than' },
          { value: 'lte', label: 'Less or Equal' },
          { value: 'contains', label: 'Contains' },
        ],
      },
      {
        id: 'value',
        name: 'Compare Value',
        type: 'text',
        placeholder: '0',
      },
    ],
  },

  {
    type: 'data.httpRequest',
    name: 'HTTP Request',
    description: 'Make an HTTP request to an external API',
    category: 'data',
    icon: 'Globe',
    color: '#10b981',
    inputs: [
      {
        id: 'body',
        name: 'Request Body',
        dataType: { type: 'any' },
      },
    ],
    outputs: [
      {
        id: 'response',
        name: 'Response',
        dataType: { type: 'object', properties: {
          status: { type: 'number' },
          data: { type: 'any' },
          headers: { type: 'object' },
        }},
      },
      {
        id: 'error',
        name: 'Error',
        dataType: { type: 'object' },
      },
    ],
    configFields: [
      {
        id: 'url',
        name: 'URL',
        type: 'text',
        required: true,
        placeholder: 'https://api.example.com/endpoint',
      },
      {
        id: 'method',
        name: 'Method',
        type: 'select',
        defaultValue: 'GET',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
          { value: 'DELETE', label: 'DELETE' },
        ],
      },
      {
        id: 'headers',
        name: 'Headers (JSON)',
        type: 'json',
        defaultValue: '{}',
      },
      {
        id: 'bodyTemplate',
        name: 'Body Template',
        description: 'JSON body (can use $input references)',
        type: 'json',
        defaultValue: '{}',
      },
    ],
  },

  // ============ UTILITY NODES ============

  {
    type: 'utility.delay',
    name: 'Delay',
    description: 'Wait for a specified time before continuing',
    category: 'utility',
    icon: 'Timer',
    color: '#6366f1',
    inputs: [
      {
        id: 'input',
        name: 'Input',
        dataType: { type: 'any' },
      },
    ],
    outputs: [
      {
        id: 'output',
        name: 'Output',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'duration',
        name: 'Duration (seconds)',
        type: 'number',
        required: true,
        defaultValue: 1,
        validation: { min: 0.1, max: 3600 },
      },
    ],
  },

  {
    type: 'utility.log',
    name: 'Log',
    description: 'Log data for debugging',
    category: 'utility',
    icon: 'FileText',
    color: '#6366f1',
    inputs: [
      {
        id: 'input',
        name: 'Input',
        dataType: { type: 'any' },
      },
    ],
    outputs: [
      {
        id: 'output',
        name: 'Output',
        description: 'Pass-through of input',
        dataType: { type: 'any' },
      },
    ],
    configFields: [
      {
        id: 'message',
        name: 'Message',
        type: 'text',
        placeholder: 'Debug: received data',
      },
      {
        id: 'level',
        name: 'Log Level',
        type: 'select',
        defaultValue: 'info',
        options: [
          { value: 'debug', label: 'Debug' },
          { value: 'info', label: 'Info' },
          { value: 'warn', label: 'Warning' },
          { value: 'error', label: 'Error' },
        ],
      },
    ],
  },

  {
    type: 'utility.stop',
    name: 'Stop',
    description: 'Stop workflow execution',
    category: 'utility',
    icon: 'StopCircle',
    color: '#ef4444',
    inputs: [
      {
        id: 'input',
        name: 'Input',
        dataType: { type: 'any' },
      },
    ],
    outputs: [],
    configFields: [
      {
        id: 'status',
        name: 'Exit Status',
        type: 'select',
        defaultValue: 'success',
        options: [
          { value: 'success', label: 'Success' },
          { value: 'failure', label: 'Failure' },
        ],
      },
      {
        id: 'message',
        name: 'Exit Message',
        type: 'text',
        placeholder: 'Workflow completed',
      },
    ],
  },
];

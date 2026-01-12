/**
 * Workflow Types and Interfaces
 * 
 * This module defines the core types for the workflow system.
 * Node types are dynamically registered by bot types.
 */

// ============ NODE CATEGORIES ============

export type NodeCategory = 
  | 'trigger'     // Start workflow execution
  | 'action'      // Perform an action (bot commands, HTTP, etc.)
  | 'logic'       // Control flow (if, loop, switch, etc.)
  | 'data'        // Data manipulation (set variable, filter, transform)
  | 'utility';    // Helpers (delay, merge, etc.)

// ============ DATA TYPES ============

export interface WorkflowDataType {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  itemType?: WorkflowDataType; // For arrays
  properties?: Record<string, WorkflowDataType>; // For objects
  description?: string;
}

// ============ NODE INPUT/OUTPUT ============

export interface NodeInput {
  id: string;
  name: string;
  description?: string;
  dataType: WorkflowDataType;
  required?: boolean;
  defaultValue?: any;
}

export interface NodeOutput {
  id: string;
  name: string;
  description?: string;
  dataType: WorkflowDataType;
}

// ============ NODE CONFIGURATION ============

export interface NodeConfigField {
  id: string;
  name: string;
  description?: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json' | 'cron' | 'bot-select' | 'coordinates';
  required?: boolean;
  defaultValue?: any;
  options?: Array<{ value: string; label: string }>; // For select/multiselect
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  // Dynamic options from bot type
  dynamicOptions?: {
    source: 'bot-events' | 'bot-actions' | 'custom';
    botType?: string; // If specified, only show for this bot type
  };
}

// ============ NODE DEFINITION ============

export interface WorkflowNodeDefinition {
  type: string;           // Unique identifier, e.g., "trigger.schedule", "action.bot.moveTo"
  name: string;           // Display name
  description: string;
  category: NodeCategory;
  icon: string;           // Icon name (lucide-react icon)
  color?: string;         // Node color for UI
  
  // Bot type association (null = available for all)
  botType?: string;
  
  // Inputs that this node accepts (from connected nodes)
  inputs: NodeInput[];
  
  // Outputs that this node produces (to connected nodes)
  outputs: NodeOutput[];
  
  // Configuration fields shown in node settings panel
  configFields: NodeConfigField[];
  
  // For triggers: event types this trigger can handle
  triggerEvents?: string[];
  
  // Execution handler (implemented in backend)
  // Not serialized, added at runtime
  execute?: (context: WorkflowExecutionContext, config: any, inputs: any) => Promise<any>;
}

// ============ WORKFLOW GRAPH ============

export interface WorkflowNode {
  id: string;
  type: string;           // References WorkflowNodeDefinition.type
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, any>;  // Node-specific configuration
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;         // Source node ID
  sourceHandle?: string;  // Output handle ID
  target: string;         // Target node ID
  targetHandle?: string;  // Input handle ID
  // Data mapping (which output field maps to which input field)
  dataMapping?: Record<string, string>; // { targetInputId: "sourceOutputId" or "expression" }
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

// ============ EXECUTION CONTEXT ============

export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  userId: string;
  
  // Current execution state
  variables: Record<string, any>;  // User-defined variables
  nodeOutputs: Record<string, any>; // Outputs from executed nodes
  
  // Trigger data
  triggerData: any;
  
  // Control
  cancelled: boolean;
  
  // Logging
  log: (nodeId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) => Promise<void>;
  
  // Bot access
  getBotInstance: (botId: string) => Promise<any>;
  
  // Emit updates to frontend
  emit: (event: string, data: any) => void;
}

// ============ TRIGGER TYPES ============

export interface TriggerConfig {
  type: 'schedule' | 'bot_event' | 'manual' | 'webhook';
  
  // Schedule trigger
  cronExpression?: string;
  timezone?: string;
  
  // Bot event trigger
  botId?: string;
  eventType?: string;      // Dynamic based on bot type
  eventFilter?: Record<string, any>; // Filter conditions
  
  // Webhook trigger
  webhookPath?: string;
  webhookMethod?: 'GET' | 'POST';
  webhookSecret?: string;
}

// ============ BOT TYPE NODE EXTENSION ============

/**
 * Interface for bot types to register their workflow nodes
 */
export interface BotTypeWorkflowNodes {
  botType: string;
  
  // Events this bot type emits (for triggers)
  events: Array<{
    id: string;
    name: string;
    description: string;
    payload: WorkflowDataType;
  }>;
  
  // Actions this bot type can perform
  actions: WorkflowNodeDefinition[];
}

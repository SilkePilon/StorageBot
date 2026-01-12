/**
 * Workflow Node Registry
 * 
 * Central registry for all workflow node types.
 * Bot types register their nodes here dynamically.
 */

import { 
  WorkflowNodeDefinition, 
  NodeCategory,
  BotTypeWorkflowNodes,
  WorkflowExecutionContext
} from './types.js';

// Core nodes (logic, data, utility)
import { coreNodes } from './nodes/core.js';
import { triggerNodes } from './nodes/triggers.js';
import { commonBotNodes } from './nodes/commonBot.js';

class WorkflowNodeRegistry {
  private static instance: WorkflowNodeRegistry;
  private nodes: Map<string, WorkflowNodeDefinition> = new Map();
  private botTypeNodes: Map<string, BotTypeWorkflowNodes> = new Map();
  private executors: Map<string, (context: WorkflowExecutionContext, config: any, inputs: any) => Promise<any>> = new Map();

  private constructor() {
    // Register core nodes on initialization
    this.registerCoreNodes();
  }

  static getInstance(): WorkflowNodeRegistry {
    if (!WorkflowNodeRegistry.instance) {
      WorkflowNodeRegistry.instance = new WorkflowNodeRegistry();
    }
    return WorkflowNodeRegistry.instance;
  }

  private registerCoreNodes(): void {
    // Register trigger nodes
    for (const node of triggerNodes) {
      this.registerNode(node);
    }

    // Register core logic/data/utility nodes
    for (const node of coreNodes) {
      this.registerNode(node);
    }

    // Register common bot action nodes
    for (const node of commonBotNodes) {
      this.registerNode(node);
    }

    console.log(`[WorkflowNodeRegistry] Registered ${this.nodes.size} core nodes`);
  }

  /**
   * Register a single node definition
   */
  registerNode(definition: WorkflowNodeDefinition): void {
    if (this.nodes.has(definition.type)) {
      console.warn(`[WorkflowNodeRegistry] Node type "${definition.type}" already registered. Overwriting.`);
    }
    this.nodes.set(definition.type, definition);
  }

  /**
   * Register an executor function for a node type
   */
  registerExecutor(
    nodeType: string, 
    executor: (context: WorkflowExecutionContext, config: any, inputs: any) => Promise<any>
  ): void {
    this.executors.set(nodeType, executor);
  }

  /**
   * Register workflow nodes for a bot type
   */
  registerBotTypeNodes(botTypeNodes: BotTypeWorkflowNodes): void {
    this.botTypeNodes.set(botTypeNodes.botType, botTypeNodes);
    
    // Register each action node with bot type prefix
    for (const action of botTypeNodes.actions) {
      const fullType = action.type.startsWith('action.') 
        ? action.type 
        : `action.${botTypeNodes.botType}.${action.type}`;
      
      this.registerNode({
        ...action,
        type: fullType,
        botType: botTypeNodes.botType,
      });
    }

    console.log(`[WorkflowNodeRegistry] Registered ${botTypeNodes.actions.length} nodes for bot type: ${botTypeNodes.botType}`);
  }

  /**
   * Get a node definition by type
   */
  getNode(type: string): WorkflowNodeDefinition | undefined {
    return this.nodes.get(type);
  }

  /**
   * Get the executor for a node type
   */
  getExecutor(type: string): ((context: WorkflowExecutionContext, config: any, inputs: any) => Promise<any>) | undefined {
    return this.executors.get(type);
  }

  /**
   * Get all nodes, optionally filtered by category
   */
  getNodes(category?: NodeCategory): WorkflowNodeDefinition[] {
    const allNodes = Array.from(this.nodes.values());
    if (category) {
      return allNodes.filter(n => n.category === category);
    }
    return allNodes;
  }

  /**
   * Get all nodes for a specific bot type (includes core nodes + bot-specific nodes)
   */
  getNodesForBotType(botType?: string): WorkflowNodeDefinition[] {
    return Array.from(this.nodes.values()).filter(node => {
      // Include if no bot type specified (core node) or matches the bot type
      return !node.botType || node.botType === botType;
    });
  }

  /**
   * Get bot type specific events for triggers
   */
  getBotTypeEvents(botType: string): BotTypeWorkflowNodes['events'] {
    const botNodes = this.botTypeNodes.get(botType);
    return botNodes?.events || [];
  }

  /**
   * Get all registered bot type workflow definitions
   */
  getAllBotTypeNodes(): Map<string, BotTypeWorkflowNodes> {
    return this.botTypeNodes;
  }

  /**
   * Get a serializable list of all nodes for API response
   */
  getNodesForApi(): Array<{
    type: string;
    name: string;
    description: string;
    category: NodeCategory;
    icon: string;
    color?: string;
    botType?: string;
    inputs: any[];
    outputs: any[];
    configFields: any[];
    triggerEvents?: string[];
  }> {
    return Array.from(this.nodes.values()).map(node => ({
      type: node.type,
      name: node.name,
      description: node.description,
      category: node.category,
      icon: node.icon,
      color: node.color,
      botType: node.botType,
      inputs: node.inputs,
      outputs: node.outputs,
      configFields: node.configFields,
      triggerEvents: node.triggerEvents,
    }));
  }

  /**
   * Get events grouped by bot type for API response
   */
  getEventsForApi(): Record<string, Array<{ id: string; name: string; description: string; payload: any }>> {
    const events: Record<string, Array<{ id: string; name: string; description: string; payload: any }>> = {};
    
    for (const [botType, botNodes] of this.botTypeNodes) {
      events[botType] = botNodes.events;
    }
    
    return events;
  }
}

export const workflowNodeRegistry = WorkflowNodeRegistry.getInstance();

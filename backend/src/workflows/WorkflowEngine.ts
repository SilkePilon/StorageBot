/**
 * Workflow Execution Engine
 * 
 * Executes workflows, manages triggers, and handles node execution.
 */

import { EventEmitter } from 'events';
import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../lib/socket.js';
import { workflowNodeRegistry } from './WorkflowNodeRegistry.js';
import { BotManager } from '../bot/BotManager.js';
import { 
  WorkflowDefinition, 
  WorkflowNode, 
  WorkflowEdge, 
  WorkflowExecutionContext,
  TriggerConfig
} from './types.js';

interface ScheduledWorkflow {
  workflowId: string;
  cronExpression: string;
  nextRun: Date;
  timeoutId?: NodeJS.Timeout;
}

interface PendingEventExecution {
  workflowId: string;
  executionId: string;
  botId?: string;
  expectedEvent: string;
  filter?: Record<string, any>;
  resolve: (data: any) => void;
  reject: (error: Error) => void;
}

export class WorkflowEngine extends EventEmitter {
  private static instance: WorkflowEngine;
  private scheduledWorkflows: Map<string, ScheduledWorkflow> = new Map();
  private runningExecutions: Map<string, WorkflowExecutionContext> = new Map();
  private botEventListeners: Map<string, Set<string>> = new Map(); // botId -> Set<workflowId>
  private pendingEventExecutions: Map<string, PendingEventExecution> = new Map(); // executionId -> pending

  private constructor() {
    super();
  }

  static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  /**
   * Initialize the engine - load active workflows and set up triggers
   */
  async initialize(): Promise<void> {
    console.log('[WorkflowEngine] Initializing...');
    
    // Load all active workflows
    const activeWorkflows = await prisma.workflow.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const workflow of activeWorkflows) {
      await this.activateWorkflow(workflow.id);
    }

    console.log(`[WorkflowEngine] Initialized with ${activeWorkflows.length} active workflows`);
  }

  /**
   * Activate a workflow - set up its triggers
   */
  async activateWorkflow(workflowId: string): Promise<void> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) return;

    const definition = workflow.definition as unknown as WorkflowDefinition;
    const triggerNode = definition.nodes.find(n => n.type.startsWith('trigger.'));
    
    if (!triggerNode) {
      console.warn(`[WorkflowEngine] Workflow ${workflowId} has no trigger node`);
      return;
    }

    // Set up trigger based on type
    switch (triggerNode.type) {
      case 'trigger.schedule':
        await this.setupScheduleTrigger(workflow, triggerNode);
        break;
      case 'trigger.botEvent':
        await this.setupBotEventTrigger(workflow, triggerNode);
        break;
      case 'trigger.webhook':
        // Webhook triggers are handled by the API route
        break;
      case 'trigger.manual':
        // Manual triggers don't need setup
        break;
    }
  }

  /**
   * Deactivate a workflow - remove its triggers
   */
  async deactivateWorkflow(workflowId: string): Promise<void> {
    // Remove scheduled trigger
    const scheduled = this.scheduledWorkflows.get(workflowId);
    if (scheduled?.timeoutId) {
      clearTimeout(scheduled.timeoutId);
    }
    this.scheduledWorkflows.delete(workflowId);

    // Remove bot event listeners
    for (const [botId, workflows] of this.botEventListeners) {
      workflows.delete(workflowId);
      if (workflows.size === 0) {
        this.botEventListeners.delete(botId);
      }
    }
  }

  /**
   * Set up a schedule trigger using cron
   */
  private async setupScheduleTrigger(workflow: any, triggerNode: WorkflowNode): Promise<void> {
    const cronExpression = triggerNode.data.config.cronExpression || workflow.cronExpression;
    if (!cronExpression) return;

    const nextRun = this.getNextCronRun(cronExpression);
    if (!nextRun) return;

    const scheduled: ScheduledWorkflow = {
      workflowId: workflow.id,
      cronExpression,
      nextRun,
    };

    // Schedule the next run
    const delay = nextRun.getTime() - Date.now();
    if (delay > 0) {
      scheduled.timeoutId = setTimeout(() => {
        this.handleScheduleTrigger(workflow.id);
      }, Math.min(delay, 2147483647)); // Max timeout is ~24 days
    }

    this.scheduledWorkflows.set(workflow.id, scheduled);

    // Update next run in database
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { nextRunAt: nextRun },
    });
  }

  /**
   * Set up a bot event trigger
   */
  private async setupBotEventTrigger(workflow: any, triggerNode: WorkflowNode): Promise<void> {
    const config = triggerNode.data.config;
    const botId = config.botId;

    if (botId) {
      // Listen to specific bot
      if (!this.botEventListeners.has(botId)) {
        this.botEventListeners.set(botId, new Set());
      }
      this.botEventListeners.get(botId)!.add(workflow.id);
    } else {
      // Listen to all bots - use '*' as special key
      if (!this.botEventListeners.has('*')) {
        this.botEventListeners.set('*', new Set());
      }
      this.botEventListeners.get('*')!.add(workflow.id);
    }
  }

  /**
   * Handle a scheduled trigger firing
   */
  private async handleScheduleTrigger(workflowId: string): Promise<void> {
    const scheduled = this.scheduledWorkflows.get(workflowId);
    if (!scheduled) return;

    // Execute the workflow
    await this.executeWorkflow(workflowId, 'schedule', {
      timestamp: new Date().toISOString(),
      scheduledTime: scheduled.nextRun.toISOString(),
    });

    // Schedule next run
    const nextRun = this.getNextCronRun(scheduled.cronExpression);
    if (nextRun) {
      scheduled.nextRun = nextRun;
      const delay = nextRun.getTime() - Date.now();
      if (delay > 0) {
        scheduled.timeoutId = setTimeout(() => {
          this.handleScheduleTrigger(workflowId);
        }, Math.min(delay, 2147483647));
      }

      await prisma.workflow.update({
        where: { id: workflowId },
        data: { nextRunAt: nextRun },
      });
    }
  }

  /**
   * Handle a bot event - check if any workflows are listening
   */
  async handleBotEvent(botId: string, eventType: string, eventData: any): Promise<void> {
    // First, check for pending executions waiting for this event
    for (const [execId, pending] of this.pendingEventExecutions) {
      // Check if bot matches (or pending is listening to all bots)
      if (pending.botId && pending.botId !== botId) continue;
      
      // Check if event type matches
      if (pending.expectedEvent !== eventType) continue;
      
      // Check filter conditions
      if (pending.filter && Object.keys(pending.filter).length > 0) {
        if (!this.matchesFilter(eventData, pending.filter)) continue;
      }

      // Get bot info
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: { id: true, name: true, botType: true },
      });

      // Resolve the pending execution
      console.log(`[WorkflowEngine] Event ${eventType} matched pending execution ${execId}`);
      pending.resolve({
        event: eventData,
        bot,
        eventType,
      });
    }

    // Then, check for active workflow triggers (existing logic)
    // Get workflows listening to this specific bot
    const specificListeners = this.botEventListeners.get(botId) || new Set();
    // Get workflows listening to all bots
    const globalListeners = this.botEventListeners.get('*') || new Set();

    const workflowIds = new Set([...specificListeners, ...globalListeners]);

    for (const workflowId of workflowIds) {
      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
      });

      if (!workflow || workflow.status !== 'ACTIVE') continue;

      const definition = workflow.definition as unknown as WorkflowDefinition;
      const triggerNode = definition.nodes.find(n => n.type === 'trigger.botEvent');
      
      if (!triggerNode) continue;

      const config = triggerNode.data.config;
      
      // Check if event type matches
      const isCore = config.eventCategory === 'core';
      const expectedEvent = isCore ? config.coreEvent : config.botTypeEvent;
      
      if (expectedEvent !== eventType) continue;

      // Check filter conditions
      if (config.filter && Object.keys(config.filter).length > 0) {
        if (!this.matchesFilter(eventData, config.filter)) continue;
      }

      // Get bot info
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: { id: true, name: true, botType: true },
      });

      // Execute the workflow
      await this.executeWorkflow(workflowId, 'bot_event', {
        event: eventData,
        bot: bot,
        eventType,
      });
    }
  }

  /**
   * Handle a webhook trigger
   */
  async handleWebhook(
    workflowId: string, 
    body: any, 
    headers: Record<string, string>,
    query: Record<string, string>
  ): Promise<{ executionId: string }> {
    const executionId = await this.executeWorkflow(workflowId, 'webhook', {
      body,
      headers,
      query,
    });

    return { executionId };
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    triggeredBy: string,
    triggerData: any
  ): Promise<string> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const definition = workflow.definition as unknown as WorkflowDefinition;
    const triggerNode = definition.nodes.find(n => n.type.startsWith('trigger.'));
    
    // If this is a manual run of a bot event trigger, we need to wait for the event
    if (triggeredBy === 'manual' && triggerNode?.type === 'trigger.botEvent') {
      return this.executeWorkflowWithEventWait(workflowId, workflow, triggerNode, definition);
    }

    // Create execution record
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId,
        triggeredBy,
        triggerData,
        status: 'RUNNING',
        context: {},
      },
    });

    // Update workflow stats
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        lastRunAt: new Date(),
        runCount: { increment: 1 },
      },
    });

    // Create execution context
    const context: WorkflowExecutionContext = {
      executionId: execution.id,
      workflowId,
      userId: workflow.userId,
      variables: {},
      nodeOutputs: {},
      triggerData,
      cancelled: false,
      log: async (nodeId, level, message, data) => {
        await this.logNode(execution.id, nodeId, '', '', level, message, data);
      },
      getBotInstance: async (botId: string) => {
        return BotManager.getInstance().getBot(botId);
      },
      emit: (event, data) => {
        emitToUser(workflow.userId, `workflow:${event}`, {
          executionId: execution.id,
          workflowId,
          ...data,
        });
      },
    };

    this.runningExecutions.set(execution.id, context);

    // Emit execution started
    context.emit('executionStarted', { triggeredBy, triggerData });

    // Execute workflow in background
    this.runWorkflow(workflow, execution.id, context).catch(async (error) => {
      console.error(`[WorkflowEngine] Execution ${execution.id} failed:`, error);
      
      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      await prisma.workflow.update({
        where: { id: workflowId },
        data: { failureCount: { increment: 1 } },
      });

      context.emit('executionFailed', { error: error.message });
      this.runningExecutions.delete(execution.id);
    });

    return execution.id;
  }

  /**
   * Execute a workflow that needs to wait for a bot event
   */
  private async executeWorkflowWithEventWait(
    workflowId: string,
    workflow: any,
    triggerNode: WorkflowNode,
    definition: WorkflowDefinition
  ): Promise<string> {
    const config = triggerNode.data.config;
    const botId = config.botId;
    const eventCategory = config.eventCategory || 'core';
    const expectedEvent = eventCategory === 'core' ? config.coreEvent : config.botTypeEvent;

    // Create execution record in WAITING status
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId,
        triggeredBy: 'manual_wait',
        triggerData: { waitingFor: expectedEvent, botId },
        status: 'WAITING',
        context: {},
      },
    });

    // Emit to frontend that we're waiting
    emitToUser(workflow.userId, 'workflow:waiting', {
      executionId: execution.id,
      workflowId,
      nodeId: triggerNode.id,
      waitingFor: expectedEvent,
      botId,
      message: `Waiting for event: ${expectedEvent}`,
    });

    // Create a promise that resolves when the event fires
    const eventPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for event: ${expectedEvent}`));
      }, 5 * 60 * 1000); // 5 minute timeout

      const cleanup = () => {
        clearTimeout(timeout);
        // Remove from pending
        this.pendingEventExecutions.delete(execution.id);
      };

      // Store the resolver for this execution
      this.pendingEventExecutions.set(execution.id, {
        workflowId,
        executionId: execution.id,
        botId,
        expectedEvent,
        filter: config.filter,
        resolve: (data: any) => {
          cleanup();
          resolve(data);
        },
        reject: (error: Error) => {
          cleanup();
          reject(error);
        },
      });
    });

    // Wait for the event and then continue execution
    eventPromise.then(async (eventData) => {
      // Update execution status
      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'RUNNING',
          triggerData: eventData,
        },
      });

      await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          lastRunAt: new Date(),
          runCount: { increment: 1 },
        },
      });

      // Create execution context
      const context: WorkflowExecutionContext = {
        executionId: execution.id,
        workflowId,
        userId: workflow.userId,
        variables: {},
        nodeOutputs: {},
        triggerData: eventData,
        cancelled: false,
        log: async (nodeId, level, message, data) => {
          await this.logNode(execution.id, nodeId, '', '', level, message, data);
        },
        getBotInstance: async (botId: string) => {
          return BotManager.getInstance().getBot(botId);
        },
        emit: (event, data) => {
          emitToUser(workflow.userId, `workflow:${event}`, {
            executionId: execution.id,
            workflowId,
            ...data,
          });
        },
      };

      this.runningExecutions.set(execution.id, context);
      context.emit('executionStarted', { triggeredBy: 'bot_event', triggerData: eventData });

      await this.runWorkflow(workflow, execution.id, context);
    }).catch(async (error) => {
      console.error(`[WorkflowEngine] Event wait failed for ${execution.id}:`, error);
      
      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      emitToUser(workflow.userId, 'workflow:executionFailed', {
        executionId: execution.id,
        workflowId,
        error: error.message,
      });
    });

    return execution.id;
  }

  /**
   * Run the workflow execution
   */
  private async runWorkflow(
    workflow: any,
    executionId: string,
    context: WorkflowExecutionContext
  ): Promise<void> {
    const definition = workflow.definition as unknown as WorkflowDefinition;
    
    // Find the trigger node (starting point)
    const triggerNode = definition.nodes.find(n => n.type.startsWith('trigger.'));
    if (!triggerNode) {
      throw new Error('No trigger node found');
    }

    // Build adjacency list for traversal
    const adjacency = new Map<string, WorkflowEdge[]>();
    for (const edge of definition.edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      adjacency.get(edge.source)!.push(edge);
    }

    // Create node lookup
    const nodeMap = new Map<string, WorkflowNode>();
    for (const node of definition.nodes) {
      nodeMap.set(node.id, node);
    }

    // Start execution from trigger node
    await this.executeNode(
      triggerNode,
      context.triggerData,
      context,
      adjacency,
      nodeMap,
      executionId
    );

    // Mark execution as completed
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        context: {
          variables: context.variables,
          nodeOutputs: context.nodeOutputs,
        },
      },
    });

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { successCount: { increment: 1 } },
    });

    context.emit('executionCompleted', {
      variables: context.variables,
    });

    this.runningExecutions.delete(executionId);
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: WorkflowNode,
    input: any,
    context: WorkflowExecutionContext,
    adjacency: Map<string, WorkflowEdge[]>,
    nodeMap: Map<string, WorkflowNode>,
    executionId: string
  ): Promise<void> {
    if (context.cancelled) return;

    const startTime = Date.now();
    const nodeDef = workflowNodeRegistry.getNode(node.type);

    // Update current node
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { currentNodeId: node.id },
    });

    context.emit('nodeStarted', {
      nodeId: node.id,
      nodeType: node.type,
      nodeName: node.data.label,
    });

    let output: any;
    let outputHandle = 'output'; // Default output handle

    try {
      // Execute node based on type
      output = await this.executeNodeLogic(node, input, context);

      // Store output
      context.nodeOutputs[node.id] = output;

      // Determine which output handle to use (for branching nodes)
      if (node.type === 'logic.if') {
        outputHandle = output.__branch || 'true';
        output = output.data || output;
      } else if (node.type === 'logic.switch') {
        outputHandle = output.__branch || 'default';
        output = output.data || output;
      } else if (node.type === 'utility.stop') {
        // Stop execution
        const status = node.data.config.status === 'failure' ? 'FAILED' : 'COMPLETED';
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status,
            errorMessage: node.data.config.message,
            completedAt: new Date(),
          },
        });
        context.cancelled = true;
        return;
      }

      const duration = Date.now() - startTime;

      await this.logNode(
        executionId,
        node.id,
        node.data.label,
        node.type,
        'info',
        `Executed successfully`,
        { output },
        input,
        output,
        duration
      );

      // Emit nodeCompleted for UI updates
      context.emit('nodeCompleted', {
        nodeId: node.id,
        output,
        duration,
      });

      // Also emit nodeComplete for n8n-style data capture
      emitToUser(context.userId, 'workflow:nodeComplete', {
        executionId,
        workflowId: context.workflowId,
        nodeId: node.id,
        output,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      await this.logNode(
        executionId,
        node.id,
        node.data.label,
        node.type,
        'error',
        `Failed: ${errorMessage}`,
        { error: errorMessage },
        input,
        undefined,
        duration
      );

      context.emit('nodeError', {
        nodeId: node.id,
        error: errorMessage,
      });

      throw error;
    }

    // Find and execute next nodes
    const edges = adjacency.get(node.id) || [];
    const matchingEdges = edges.filter(e => {
      // Match by output handle or default
      if (!e.sourceHandle) return true;
      return e.sourceHandle === outputHandle;
    });

    for (const edge of matchingEdges) {
      const nextNode = nodeMap.get(edge.target);
      if (!nextNode) continue;

      // Map output to next node's input
      let nextInput = output;
      if (edge.dataMapping) {
        nextInput = this.applyDataMapping(output, edge.dataMapping, context);
      }

      await this.executeNode(
        nextNode,
        nextInput,
        context,
        adjacency,
        nodeMap,
        executionId
      );
    }
  }

  /**
   * Execute the logic for a specific node type
   */
  private async executeNodeLogic(
    node: WorkflowNode,
    input: any,
    context: WorkflowExecutionContext
  ): Promise<any> {
    const config = node.data.config || {};

    // Check for registered executor first
    const executor = workflowNodeRegistry.getExecutor(node.type);
    if (executor) {
      return await executor(context, config, input);
    }

    // Built-in node logic
    switch (node.type) {
      // Triggers just pass through their data
      case 'trigger.manual':
      case 'trigger.schedule':
      case 'trigger.botEvent':
      case 'trigger.webhook':
        return input;

      // Logic nodes
      case 'logic.if':
        return this.executeIf(config, input);

      case 'logic.switch':
        return this.executeSwitch(config, input);

      case 'logic.loop':
        return await this.executeLoop(config, input, context, node);

      case 'logic.merge':
        return input; // Simple pass-through for now

      // Data nodes
      case 'data.setVariable':
        return this.executeSetVariable(config, input, context);

      case 'data.transform':
        return this.executeTransform(config, input, context);

      case 'data.filter':
        return this.executeFilter(config, input);

      case 'data.httpRequest':
        return await this.executeHttpRequest(config, input);

      // Utility nodes
      case 'utility.delay':
        await this.sleep(config.duration * 1000);
        return input;

      case 'utility.log':
        console.log(`[Workflow Log] ${config.message}:`, input);
        return input;

      case 'utility.stop':
        return { __stop: true, status: config.status };

      // Bot action nodes
      default:
        if (node.type.startsWith('action.bot.')) {
          return await this.executeBotAction(node.type, config, input, context);
        }
        if (node.type.startsWith('action.storage.')) {
          return await this.executeStorageAction(node.type, config, input, context);
        }
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  // ============ Node Execution Helpers ============

  private executeIf(config: any, input: any): any {
    const fieldValue = this.getNestedValue(input, config.field);
    const compareValue = this.parseValue(config.value);
    const result = this.compareValues(fieldValue, compareValue, config.operator);

    return {
      __branch: result ? 'true' : 'false',
      data: input,
    };
  }

  private executeSwitch(config: any, input: any): any {
    const fieldValue = this.getNestedValue(input, config.field);
    const cases = JSON.parse(config.cases || '[]');
    
    const matchIndex = cases.findIndex((c: any) => c === fieldValue);
    const branch = matchIndex >= 0 ? `case_${matchIndex}` : 'default';

    return {
      __branch: branch,
      data: input,
    };
  }

  private async executeLoop(
    config: any, 
    input: any, 
    context: WorkflowExecutionContext,
    node: WorkflowNode
  ): Promise<any> {
    // For now, return the array items one by one
    // Full loop implementation would need to handle sub-graph execution
    let items: any[];
    
    if (config.mode === 'count') {
      items = Array.from({ length: config.count }, (_, i) => i);
    } else {
      items = this.getNestedValue(input, config.arrayPath) || [];
      if (!Array.isArray(items)) items = [items];
    }

    // Return aggregated results
    return {
      items,
      count: items.length,
    };
  }

  private executeSetVariable(config: any, input: any, context: WorkflowExecutionContext): any {
    const value = config.valueExpression 
      ? this.evaluateExpression(config.valueExpression, input, context)
      : input;
    
    context.variables[config.variableName] = value;
    return input;
  }

  private executeTransform(config: any, input: any, context: WorkflowExecutionContext): any {
    const transformations = JSON.parse(config.transformations || '{}');
    const result: any = {};

    for (const [key, expression] of Object.entries(transformations)) {
      result[key] = this.evaluateExpression(expression as string, input, context);
    }

    return result;
  }

  private executeFilter(config: any, input: any): any {
    const array = Array.isArray(input) ? input : (input?.array || []);
    
    const filtered: any[] = [];
    const excluded: any[] = [];

    for (const item of array) {
      const fieldValue = this.getNestedValue(item, config.field);
      const compareValue = this.parseValue(config.value);
      
      if (this.compareValues(fieldValue, compareValue, config.operator)) {
        filtered.push(item);
      } else {
        excluded.push(item);
      }
    }

    return { filtered, excluded };
  }

  private async executeHttpRequest(config: any, input: any): Promise<any> {
    const url = this.interpolateString(config.url, input);
    const headers = JSON.parse(config.headers || '{}');
    const body = config.method !== 'GET' ? JSON.parse(config.bodyTemplate || '{}') : undefined;

    try {
      const response = await fetch(url, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json().catch(() => null);

      return {
        status: response.status,
        data,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      return {
        error: (error as Error).message,
      };
    }
  }

  private async executeBotAction(
    nodeType: string,
    config: any,
    input: any,
    context: WorkflowExecutionContext
  ): Promise<any> {
    const botInstance = await context.getBotInstance(config.botId);
    if (!botInstance) {
      throw new Error(`Bot ${config.botId} not found or not connected`);
    }

    const bot = botInstance.getMineflayerBot();
    if (!bot) {
      throw new Error('Bot is not connected');
    }

    switch (nodeType) {
      case 'action.bot.connect':
        await botInstance.connect({
          host: config.host || bot.connect?.host,
          port: config.port || 25565,
        });
        return { success: true };

      case 'action.bot.disconnect':
        await botInstance.disconnect();
        return { success: true };

      case 'action.bot.moveTo':
        const coords = config.coordinates || input?.coordinates;
        if (coords) {
          await botInstance.moveTo(coords.x, coords.y, coords.z);
        }
        return { success: true, finalPosition: bot.entity?.position };

      case 'action.bot.chat':
        const message = this.interpolateString(config.message, input);
        bot.chat(message);
        return { success: true };

      case 'action.bot.eat':
        // Find food in inventory and eat
        const foodItems = bot.inventory.items().filter((item: any) => {
          const foodTypes = ['apple', 'bread', 'cooked', 'golden_apple', 'carrot', 'potato', 'steak', 'porkchop'];
          return foodTypes.some(f => item.name.includes(f));
        });
        
        if (foodItems.length > 0) {
          const food = config.preferredFood 
            ? foodItems.find((f: any) => f.name.includes(config.preferredFood)) || foodItems[0]
            : foodItems[0];
          
          await bot.equip(food, 'hand');
          await bot.consume();
          return { success: true, foodEaten: food.name, newFoodLevel: bot.food };
        }
        return { success: false, error: 'No food in inventory' };

      case 'action.bot.getStatus':
        return botInstance.getStatus();

      case 'action.bot.getInventory':
        const items = bot.inventory.items().map((item: any) => ({
          slot: item.slot,
          itemId: item.name,
          itemName: item.displayName,
          count: item.count,
        }));
        const freeSlots = 36 - items.length;
        return { items, freeSlots };

      case 'action.bot.stopMoving':
        bot.pathfinder?.stop();
        return { success: true };

      default:
        throw new Error(`Unknown bot action: ${nodeType}`);
    }
  }

  private async executeStorageAction(
    nodeType: string,
    config: any,
    input: any,
    context: WorkflowExecutionContext
  ): Promise<any> {
    // Storage-specific actions would be implemented here
    // For now, return placeholder
    return { success: true, action: nodeType };
  }

  // ============ Utility Methods ============

  private getNestedValue(obj: any, path: string): any {
    if (!path || !obj) return obj;
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  private parseValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (!isNaN(Number(value))) return Number(value);
    return value;
  }

  private compareValues(a: any, b: any, operator: string): boolean {
    switch (operator) {
      case 'eq': return a === b;
      case 'neq': return a !== b;
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
      case 'contains': return String(a).includes(String(b));
      case 'startsWith': return String(a).startsWith(String(b));
      case 'endsWith': return String(a).endsWith(String(b));
      case 'exists': return a !== null && a !== undefined;
      case 'notExists': return a === null || a === undefined;
      case 'isEmpty': return !a || (Array.isArray(a) && a.length === 0);
      case 'isNotEmpty': return !!a && (!Array.isArray(a) || a.length > 0);
      default: return false;
    }
  }

  private evaluateExpression(expression: string, input: any, context: WorkflowExecutionContext): any {
    // Simple expression evaluation
    // Supports: $input.path, $var.name, literal values
    if (expression.startsWith('$input.')) {
      return this.getNestedValue(input, expression.slice(7));
    }
    if (expression.startsWith('$var.')) {
      return context.variables[expression.slice(5)];
    }
    if (expression.startsWith('$node.')) {
      const parts = expression.slice(6).split('.');
      const nodeId = parts[0];
      const path = parts.slice(1).join('.');
      return this.getNestedValue(context.nodeOutputs[nodeId], path);
    }
    
    // Check for simple math expressions
    if (/^[\d\s+\-*/().]+$/.test(expression)) {
      try {
        return eval(expression);
      } catch {
        return expression;
      }
    }

    return expression;
  }

  private interpolateString(template: string, input: any): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
      if (path.startsWith('input.')) {
        return String(this.getNestedValue(input, path.slice(6)) ?? '');
      }
      return String(this.getNestedValue(input, path) ?? '');
    });
  }

  private applyDataMapping(
    output: any, 
    mapping: Record<string, string>,
    context: WorkflowExecutionContext
  ): any {
    const result: any = {};
    for (const [targetKey, sourceExpression] of Object.entries(mapping)) {
      result[targetKey] = this.evaluateExpression(sourceExpression, output, context);
    }
    return result;
  }

  private matchesFilter(data: any, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (this.getNestedValue(data, key) !== value) {
        return false;
      }
    }
    return true;
  }

  private getNextCronRun(cronExpression: string): Date | null {
    // Simple cron parsing for common patterns
    // Format: minute hour dayOfMonth month dayOfWeek
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) return null;

    const now = new Date();
    const next = new Date(now);

    // Simple implementation - just handle "every X minutes/hours"
    const [minute, hour] = parts;

    if (minute === '*') {
      // Every minute
      next.setMinutes(next.getMinutes() + 1);
      next.setSeconds(0);
      next.setMilliseconds(0);
    } else if (minute.startsWith('*/')) {
      // Every N minutes
      const interval = parseInt(minute.slice(2));
      const currentMinute = next.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
      next.setMinutes(nextMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);
    } else if (hour === '*') {
      // At specific minute every hour
      const targetMinute = parseInt(minute);
      if (next.getMinutes() >= targetMinute) {
        next.setHours(next.getHours() + 1);
      }
      next.setMinutes(targetMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);
    } else {
      // Specific time
      const targetMinute = parseInt(minute);
      const targetHour = parseInt(hour);
      
      next.setHours(targetHour);
      next.setMinutes(targetMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  }

  private async logNode(
    executionId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    level: string,
    message: string,
    data?: any,
    inputData?: any,
    outputData?: any,
    duration?: number
  ): Promise<void> {
    await prisma.workflowExecutionLog.create({
      data: {
        executionId,
        nodeId,
        nodeName,
        nodeType,
        level,
        message,
        data: data || undefined,
        inputData: inputData || undefined,
        outputData: outputData || undefined,
        duration,
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel a running execution
   */
  cancelExecution(executionId: string): boolean {
    const context = this.runningExecutions.get(executionId);
    if (context) {
      context.cancelled = true;
      return true;
    }
    return false;
  }

  /**
   * Get running executions for a user
   */
  getRunningExecutions(userId: string): string[] {
    const result: string[] = [];
    for (const [execId, context] of this.runningExecutions) {
      if (context.userId === userId) {
        result.push(execId);
      }
    }
    return result;
  }
}

export const workflowEngine = WorkflowEngine.getInstance();

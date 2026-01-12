/**
 * Workflows Module Index
 * 
 * Main export file for the workflow system.
 */

export * from './types.js';
export { workflowNodeRegistry } from './WorkflowNodeRegistry.js';
export { WorkflowEngine } from './WorkflowEngine.js';

// Bot type workflow nodes - imported to trigger registration
import { storageBotWorkflowNodes } from './nodes/botTypes/storage.js';
import { workflowNodeRegistry } from './WorkflowNodeRegistry.js';

// Register bot type nodes
export function initializeWorkflowNodes(): void {
  console.log('[Workflows] Initializing workflow node registry...');
  
  // Register storage bot nodes
  workflowNodeRegistry.registerBotTypeNodes(storageBotWorkflowNodes);
  
  console.log('[Workflows] Workflow node registry initialized');
}

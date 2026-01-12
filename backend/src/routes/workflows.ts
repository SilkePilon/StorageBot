/**
 * Workflow API Routes
 * 
 * CRUD operations for workflows and execution management.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { workflowNodeRegistry } from '../workflows/WorkflowNodeRegistry.js';
import { workflowEngine } from '../workflows/WorkflowEngine.js';

const router = Router();

// ============ WORKFLOW CRUD ============

// List all workflows for the authenticated user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        triggerType: true,
        lastRunAt: true,
        nextRunAt: true,
        runCount: true,
        successCount: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(workflows);
  } catch (error) {
    console.error('Failed to list workflows:', error);
    res.status(500).json({ error: 'Failed to list workflows' });
  }
});

// Get a single workflow with full definition
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    res.json(workflow);
  } catch (error) {
    console.error('Failed to get workflow:', error);
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

// Create a new workflow
const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  definition: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    viewport: z.object({
      x: z.number(),
      y: z.number(),
      zoom: z.number(),
    }).optional(),
  }).optional(),
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data = createWorkflowSchema.parse(req.body);

    const workflow = await prisma.workflow.create({
      data: {
        userId: req.userId!,
        name: data.name,
        description: data.description,
        status: 'DRAFT',
        definition: data.definition || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      },
    });

    res.status(201).json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid workflow data', details: error.errors });
      return;
    }
    console.error('Failed to create workflow:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Update a workflow
const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  definition: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    viewport: z.object({
      x: z.number(),
      y: z.number(),
      zoom: z.number(),
    }).optional(),
  }).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateWorkflowSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Extract trigger info from definition
    let triggerType: string | undefined;
    let cronExpression: string | undefined;
    let triggerConfig: any | undefined;

    if (data.definition) {
      const triggerNode = data.definition.nodes.find((n: any) => n.type?.startsWith('trigger.'));
      if (triggerNode) {
        triggerType = triggerNode.type.replace('trigger.', '');
        triggerConfig = triggerNode.data?.config;
        
        if (triggerNode.type === 'trigger.schedule') {
          cronExpression = triggerNode.data?.config?.cronExpression;
        }
      }
    }

    // Generate webhook token if needed
    let webhookToken = existing.webhookToken;
    if (triggerType === 'webhook' && !webhookToken) {
      webhookToken = randomUUID();
    }

    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...data,
        triggerType,
        triggerConfig,
        cronExpression,
        webhookToken,
      },
    });

    // Handle status changes
    if (data.status) {
      if (data.status === 'ACTIVE') {
        await workflowEngine.activateWorkflow(workflow.id);
      } else {
        await workflowEngine.deactivateWorkflow(workflow.id);
      }
    }

    res.json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid workflow data', details: error.errors });
      return;
    }
    console.error('Failed to update workflow:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// Delete a workflow
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Verify ownership
    const existing = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Deactivate first
    await workflowEngine.deactivateWorkflow(req.params.id);

    await prisma.workflow.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete workflow:', error);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// ============ WORKFLOW EXECUTION ============

// Run a workflow manually
router.post('/:id/run', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    const executionId = await workflowEngine.executeWorkflow(
      workflow.id,
      'manual',
      req.body.input || {}
    );

    res.json({ executionId });
  } catch (error) {
    console.error('Failed to run workflow:', error);
    res.status(500).json({ error: 'Failed to run workflow' });
  }
});

// Get workflow executions
router.get('/:id/executions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Verify ownership
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const executions = await prisma.workflowExecution.findMany({
      where: { workflowId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        status: true,
        triggeredBy: true,
        triggerData: true,
        currentNodeId: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const total = await prisma.workflowExecution.count({
      where: { workflowId: req.params.id },
    });

    res.json({
      executions,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to get executions:', error);
    res.status(500).json({ error: 'Failed to get executions' });
  }
});

// Get execution details with logs
router.get('/executions/:executionId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: req.params.executionId },
      include: {
        workflow: {
          select: { userId: true, name: true },
        },
        logs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!execution || execution.workflow.userId !== req.userId) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    res.json(execution);
  } catch (error) {
    console.error('Failed to get execution:', error);
    res.status(500).json({ error: 'Failed to get execution' });
  }
});

// Cancel a running execution
router.post('/executions/:executionId/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: req.params.executionId },
      include: {
        workflow: {
          select: { userId: true },
        },
      },
    });

    if (!execution || execution.workflow.userId !== req.userId) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    const cancelled = workflowEngine.cancelExecution(req.params.executionId);

    if (cancelled) {
      await prisma.workflowExecution.update({
        where: { id: req.params.executionId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });
    }

    res.json({ cancelled });
  } catch (error) {
    console.error('Failed to cancel execution:', error);
    res.status(500).json({ error: 'Failed to cancel execution' });
  }
});

// ============ NODE REGISTRY ============

// Get all available node types
router.get('/nodes/types', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const nodes = workflowNodeRegistry.getNodesForApi();
    const events = workflowNodeRegistry.getEventsForApi();

    res.json({ nodes, events });
  } catch (error) {
    console.error('Failed to get node types:', error);
    res.status(500).json({ error: 'Failed to get node types' });
  }
});

// ============ WEBHOOK TRIGGER ============

// Webhook endpoint (no auth - uses webhook token)
router.all('/webhook/:token', async (req: Request, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: {
        webhookToken: req.params.token,
        status: 'ACTIVE',
      },
    });

    if (!workflow) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Check method
    const definition = workflow.definition as any;
    const triggerNode = definition.nodes?.find((n: any) => n.type === 'trigger.webhook');
    const expectedMethod = triggerNode?.data?.config?.method || 'POST';
    
    if (req.method !== expectedMethod) {
      res.status(405).json({ error: `Method ${req.method} not allowed` });
      return;
    }

    // Check secret if required
    if (triggerNode?.data?.config?.requireAuth) {
      const secret = req.headers['x-webhook-secret'];
      // For now, just check that a secret is provided
      // In production, you'd validate against a stored secret
      if (!secret) {
        res.status(401).json({ error: 'X-Webhook-Secret header required' });
        return;
      }
    }

    const { executionId } = await workflowEngine.handleWebhook(
      workflow.id,
      req.body,
      req.headers as Record<string, string>,
      req.query as Record<string, string>
    );

    res.json({ success: true, executionId });
  } catch (error) {
    console.error('Failed to handle webhook:', error);
    res.status(500).json({ error: 'Failed to handle webhook' });
  }
});

// ============ IMPORT/EXPORT ============

// Export a workflow
router.get('/:id/export', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    const exportData = {
      version: '1.0',
      name: workflow.name,
      description: workflow.description,
      definition: workflow.definition,
      exportedAt: new Date().toISOString(),
    };

    res.json(exportData);
  } catch (error) {
    console.error('Failed to export workflow:', error);
    res.status(500).json({ error: 'Failed to export workflow' });
  }
});

// Import a workflow
const importWorkflowSchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  definition: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    viewport: z.object({
      x: z.number(),
      y: z.number(),
      zoom: z.number(),
    }).optional(),
  }),
});

router.post('/import', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data = importWorkflowSchema.parse(req.body);

    // Create new workflow from import
    const workflow = await prisma.workflow.create({
      data: {
        userId: req.userId!,
        name: `${data.name} (imported)`,
        description: data.description,
        status: 'DRAFT',
        definition: data.definition,
      },
    });

    res.status(201).json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid import data', details: error.errors });
      return;
    }
    console.error('Failed to import workflow:', error);
    res.status(500).json({ error: 'Failed to import workflow' });
  }
});

// Duplicate a workflow
router.post('/:id/duplicate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const original = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!original) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    const workflow = await prisma.workflow.create({
      data: {
        userId: req.userId!,
        name: `${original.name} (copy)`,
        description: original.description,
        status: 'DRAFT',
        definition: original.definition as any,
      },
    });

    res.status(201).json(workflow);
  } catch (error) {
    console.error('Failed to duplicate workflow:', error);
    res.status(500).json({ error: 'Failed to duplicate workflow' });
  }
});

export default router;

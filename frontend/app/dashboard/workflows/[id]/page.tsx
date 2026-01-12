"use client";

import { use, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  type Edge,
  type NodeTypes,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  useWorkflow,
  useUpdateWorkflow,
  useRunWorkflow,
  useWorkflowNodeTypes,
  useWorkflowExecutions,
} from "@/hooks/use-workflows";
import { useBots } from "@/hooks/use-bots";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  Settings,
  History,
  Search,
  GripVertical,
  Zap,
  Bot,
  Variable,
  Square,
  GitBranch,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
} from "lucide-react";

import { WorkflowNode, type WorkflowNodeType } from "@/components/workflows/workflow-node";
import { NodeConfigPanel } from "@/components/workflows/node-config-panel";
import { NodeConfigDialog } from "@/components/workflows/node-config-dialog";
import { ExecutionPanel } from "@/components/workflows/execution-panel";
import { useSocket } from "@/hooks/use-socket";

// Define custom node types
const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode,
};

// Default edge options - smooth bezier curves
const defaultEdgeOptions = {
  type: "default",
  animated: true,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: "#666",
  },
  style: {
    strokeWidth: 2,
    stroke: "#666",
  },
};

// Storage key for node output data
const getStorageKey = (workflowId: string) => `workflow-node-data-${workflowId}`;

interface PageProps {
  params: Promise<{ id: string }>;
}

function WorkflowEditorContent({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes } = useReactFlow<WorkflowNodeType, Edge>();
  const { socket } = useSocket();

  const { data: workflow, isLoading: workflowLoading } = useWorkflow(workflowId);
  const { data: nodeTypesData, isLoading: nodeTypesLoading } = useWorkflowNodeTypes();
  const { data: bots } = useBots();
  const { data: executions, refetch: refetchExecutions } = useWorkflowExecutions(workflowId, 10);
  const updateWorkflow = useUpdateWorkflow();
  const runWorkflow = useRunWorkflow();

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNodeType | null>(null);
  const [showNodePalette, setShowNodePalette] = useState(false);
  const [showExecutions, setShowExecutions] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    trigger: true,
    logic: true,
    action: false,
    data: false,
    utility: false,
  });

  // State for storing node output data (n8n-style)
  const [nodeOutputData, setNodeOutputData] = useState<Record<string, any>>(() => {
    // Load from localStorage on init
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(getStorageKey(workflowId));
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return {};
        }
      }
    }
    return {};
  });

  // Save node output data to localStorage when it changes
  useEffect(() => {
    if (typeof window !== "undefined" && Object.keys(nodeOutputData).length > 0) {
      localStorage.setItem(getStorageKey(workflowId), JSON.stringify(nodeOutputData));
    }
  }, [nodeOutputData, workflowId]);

  // Listen for execution events to capture node outputs and update execution state
  useEffect(() => {
    if (!socket) return;

    const handleNodeStart = (data: { nodeId: string; workflowId: string }) => {
      if (data.workflowId === workflowId) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === data.nodeId
              ? { ...node, data: { ...node.data, executionState: "running" as const } }
              : node
          )
        );
      }
    };

    const handleNodeComplete = (data: { 
      nodeId: string; 
      output: any; 
      workflowId: string;
      success?: boolean;
    }) => {
      if (data.workflowId === workflowId) {
        if (data.output) {
          setNodeOutputData((prev) => ({
            ...prev,
            [data.nodeId]: data.output,
          }));
        }
        setNodes((nds) =>
          nds.map((node) =>
            node.id === data.nodeId
              ? { ...node, data: { ...node.data, executionState: "success" as const } }
              : node
          )
        );
      }
    };

    const handleNodeError = (data: { nodeId: string; workflowId: string; error?: string }) => {
      if (data.workflowId === workflowId) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === data.nodeId
              ? { ...node, data: { ...node.data, executionState: "error" as const } }
              : node
          )
        );
      }
    };

    const handleWorkflowWaiting = (data: { nodeId: string; workflowId: string; eventType?: string }) => {
      if (data.workflowId === workflowId) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === data.nodeId
              ? { ...node, data: { ...node.data, executionState: "waiting" as const } }
              : node
          )
        );
      }
    };

    const handleExecutionComplete = () => {
      refetchExecutions();
    };

    const handleWorkflowStart = (data: { workflowId: string }) => {
      if (data.workflowId === workflowId) {
        // Reset all nodes to idle state when workflow starts
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            data: { ...node.data, executionState: "idle" as const },
          }))
        );
      }
    };

    socket.on("workflow:start", handleWorkflowStart);
    socket.on("workflow:nodeStart", handleNodeStart);
    socket.on("workflow:nodeComplete", handleNodeComplete);
    socket.on("workflow:nodeError", handleNodeError);
    socket.on("workflow:waiting", handleWorkflowWaiting);
    socket.on("workflow:complete", handleExecutionComplete);
    socket.on("workflow:error", handleExecutionComplete);

    return () => {
      socket.off("workflow:start", handleWorkflowStart);
      socket.off("workflow:nodeStart", handleNodeStart);
      socket.off("workflow:nodeComplete", handleNodeComplete);
      socket.off("workflow:nodeError", handleNodeError);
      socket.off("workflow:waiting", handleWorkflowWaiting);
      socket.off("workflow:complete", handleExecutionComplete);
      socket.off("workflow:error", handleExecutionComplete);
    };
  }, [socket, workflowId, refetchExecutions, setNodes]);

  // Clear cached node data
  const clearNodeData = useCallback(() => {
    setNodeOutputData({});
    localStorage.removeItem(getStorageKey(workflowId));
  }, [workflowId]);

  // Load workflow data into React Flow
  useEffect(() => {
    if (workflow?.definition) {
      const def = workflow.definition as any;
      if (def.nodes) {
        setNodes(
          def.nodes.map((node: any) => ({
            ...node,
            type: "workflowNode",
          }))
        );
      }
      if (def.edges) {
        setEdges(def.edges);
      }
    }
  }, [workflow, setNodes, setEdges]);

  // Track changes - compare normalized node structures
  useEffect(() => {
    if (workflow?.definition) {
      const def = workflow.definition as any;
      const savedNodes = def.nodes || [];
      const currentNodes = getNodes();
      
      // Normalize nodes for comparison (only compare id, position, data, and nodeType)
      const normalizeNode = (node: any) => ({
        id: node.id,
        type: node.data?.nodeType || node.type,
        position: node.position,
        data: node.data,
      });
      
      const normalizedCurrent = currentNodes.map(normalizeNode);
      const normalizedSaved = savedNodes.map(normalizeNode);
      
      const nodesChanged = JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedSaved);
      const edgesChanged = JSON.stringify(edges) !== JSON.stringify(def.edges || []);
      setHasChanges(nodesChanged || edgesChanged);
    }
  }, [nodes, edges, workflow, getNodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
      setHasChanges(true);
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: WorkflowNodeType) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !reactFlowWrapper.current) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeType = nodeTypesData?.nodes?.find((n: any) => n.type === type);
      if (!nodeType) return;

      const newNodeId = `${type}-${Date.now()}`;
      const newNode: WorkflowNodeType = {
        id: newNodeId,
        type: "workflowNode",
        position,
        data: {
          nodeType: type,
          label: nodeType.name,
          category: nodeType.category,
          config: {},
          inputs: nodeType.inputs || [],
          outputs: nodeType.outputs || [],
          icon: nodeType.icon,
        },
      };

      // Get current nodes to find the last one for auto-connection
      const currentNodes = getNodes();
      
      setNodes((nds) => [...nds, newNode]);
      
      // Auto-connect to the last node if this isn't a trigger and there are existing nodes
      if (nodeType.category !== "trigger" && currentNodes.length > 0) {
        // Find the rightmost node (likely the last in the chain)
        const lastNode = currentNodes.reduce((rightmost, node) => {
          if (!rightmost) return node;
          return node.position.x > rightmost.position.x ? node : rightmost;
        }, currentNodes[0]);
        
        if (lastNode) {
          const newEdge: Edge = {
            id: `e-${lastNode.id}-${newNodeId}`,
            source: lastNode.id,
            target: newNodeId,
            ...defaultEdgeOptions,
          };
          setEdges((eds) => [...eds, newEdge]);
        }
      }
      
      setHasChanges(true);
      setSelectedNode(newNode);
      setShowNodePalette(false);
    },
    [screenToFlowPosition, nodeTypesData, setNodes, setEdges, getNodes]
  );

  const handleSave = async () => {
    if (!workflowId) return;
    setIsSaving(true);
    try {
      const currentNodes = getNodes().map((node) => ({
        id: node.id,
        type: node.data?.nodeType, // Use the workflow node type (e.g., trigger.botEvent)
        position: node.position,
        data: node.data,
      }));
      
      await updateWorkflow.mutateAsync({
        id: workflowId,
        data: {
          definition: {
            nodes: currentNodes,
            edges,
            variables: (workflow?.definition as any)?.variables || {},
          },
        },
      });
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save workflow:", error);
    }
    setIsSaving(false);
  };

  const handleRun = async () => {
    if (!workflowId) return;
    try {
      await runWorkflow.mutateAsync({ id: workflowId });
      setShowExecutions(true);
    } catch (error) {
      console.error("Failed to run workflow:", error);
    }
  };

  const updateNodeConfig = useCallback(
    (nodeId: string, config: any) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                config,
              },
            };
          }
          return node;
        })
      );
      setHasChanges(true);
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNode(null);
      setHasChanges(true);
    },
    [setNodes, setEdges]
  );

  // Group node types by category
  const groupedNodeTypes = useMemo(() => {
    if (!nodeTypesData?.nodes) return {};
    
    const filtered = nodeTypesData.nodes.filter((node: any) =>
      node.name.toLowerCase().includes(nodeSearch.toLowerCase()) ||
      node.type.toLowerCase().includes(nodeSearch.toLowerCase())
    );

    return filtered.reduce((acc: any, node: any) => {
      const category = node.category || "other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(node);
      return acc;
    }, {});
  }, [nodeTypesData, nodeSearch]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "trigger":
        return <Zap className="h-3.5 w-3.5" />;
      case "logic":
        return <GitBranch className="h-3.5 w-3.5" />;
      case "action":
        return <Bot className="h-3.5 w-3.5" />;
      case "data":
        return <Variable className="h-3.5 w-3.5" />;
      case "utility":
        return <Settings className="h-3.5 w-3.5" />;
      default:
        return <Square className="h-3.5 w-3.5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "trigger":
        return "text-purple-400";
      case "logic":
        return "text-blue-400";
      case "action":
        return "text-green-400";
      case "data":
        return "text-orange-400";
      case "utility":
        return "text-gray-400";
      default:
        return "text-muted-foreground";
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  if (workflowLoading || nodeTypesLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
        <p className="text-muted-foreground">Workflow not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/workflows")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Workflows
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header - same style as dashboard */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard/workflows")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{workflow.name}</h1>
              {hasChanges && (
                <Badge variant="outline" className="text-orange-400 border-orange-400/50 text-xs">
                  Unsaved
                </Badge>
              )}
            </div>
            {workflow.description && (
              <p className="text-xs text-muted-foreground">{workflow.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showNodePalette ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowNodePalette(!showNodePalette)}
          >
            <Layers className="h-3.5 w-3.5" />
            Nodes
          </Button>
          <Button
            variant={showExecutions ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowExecutions(!showExecutions)}
          >
            <History className="h-3.5 w-3.5" />
            Runs
          </Button>
          {Object.keys(nodeOutputData).length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-purple-400 border-purple-400/30 hover:bg-purple-400/10"
                  onClick={clearNodeData}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {Object.keys(nodeOutputData).length} cached
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Click to clear cached node data</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button 
                  size="sm" 
                  className="h-8 gap-1.5" 
                  onClick={handleRun} 
                  disabled={runWorkflow.isPending || hasChanges}
                >
                  {runWorkflow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Run
                </Button>
              </span>
            </TooltipTrigger>
            {hasChanges && (
              <TooltipContent>
                <p>Save changes before running</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>

      {/* Editor Canvas */}
      <div className="relative border rounded-lg overflow-hidden bg-muted/20" style={{ height: "calc(100vh - 200px)" }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
          <Controls className="!bg-card !border !border-border !rounded-lg !shadow-md" />

          {/* Node Palette */}
          {showNodePalette && (
            <Panel position="top-left" className="!m-3">
              <div className="w-56 bg-card border rounded-lg shadow-xl overflow-hidden">
                <div className="p-2.5 bg-muted/50 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search nodes..."
                      className="h-8 pl-8 text-xs bg-background"
                      value={nodeSearch}
                      onChange={(e) => setNodeSearch(e.target.value)}
                    />
                  </div>
                </div>
                <ScrollArea className="h-72">
                  <div className="p-1.5 space-y-0.5">
                    {Object.entries(groupedNodeTypes).map(([category, categoryNodes]: [string, any]) => (
                      <Collapsible
                        key={category}
                        open={expandedCategories[category]}
                        onOpenChange={() => toggleCategory(category)}
                      >
                        <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium hover:bg-muted/80 transition-colors">
                          <div className={`w-5 h-5 rounded flex items-center justify-center ${category === 'trigger' ? 'bg-purple-500/20 text-purple-400' : category === 'action' ? 'bg-green-500/20 text-green-400' : category === 'logic' ? 'bg-blue-500/20 text-blue-400' : category === 'data' ? 'bg-orange-500/20 text-orange-400' : 'bg-muted text-muted-foreground'}`}>
                            {getCategoryIcon(category)}
                          </div>
                          <span className="capitalize flex-1 text-left">{category}</span>
                          {expandedCategories[category] ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-0.5 ml-2 border-l border-border/50 pl-2 space-y-0.5">
                            {categoryNodes.map((node: any) => (
                              <div
                                key={node.type}
                                className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-grab text-xs transition-colors"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("application/reactflow", node.type);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                title={node.description}
                              >
                                <GripVertical className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
                                <span className="truncate flex-1">{node.name}</span>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </Panel>
          )}



          {/* Runs Panel */}
          {showExecutions && (
            <Panel position="top-right" className="!m-3">
              <div className="w-64 bg-card border rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-2.5 bg-muted/50 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Execution History</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={() => setShowExecutions(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ScrollArea className="h-56">
                  <ExecutionPanel workflowId={workflowId} executions={executions} />
                </ScrollArea>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Node Config Dialog - 3-part horizontal layout */}
        <NodeConfigDialog
          node={selectedNode}
          nodeTypes={nodeTypesData?.nodes || []}
          bots={bots || []}
          allNodes={nodes}
          edges={edges}
          nodeOutputData={nodeOutputData}
          onConfigChange={updateNodeConfig}
          onDelete={deleteNode}
          onClose={() => setSelectedNode(null)}
        />

        {/* Empty state overlay */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Layers className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No nodes yet</p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Click &quot;Nodes&quot; to add your first node
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowEditorPage({ params }: PageProps) {
  const resolvedParams = use(params);
  
  return (
    <ReactFlowProvider>
      <WorkflowEditorContent workflowId={resolvedParams.id} />
    </ReactFlowProvider>
  );
}

"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRight,
  ChevronDown,
  Trash2,
  AlertTriangle,
  GripVertical,
  Zap,
  Bot,
  GitBranch,
  Variable,
  Settings,
  Database,
  ArrowRight,
} from "lucide-react";
import { NodeConfigPanel } from "./node-config-panel";
import type { WorkflowNodeType } from "./workflow-node";
import type { Edge } from "@xyflow/react";

interface NodeConfigDialogProps {
  node: WorkflowNodeType | null;
  nodeTypes: any[];
  bots: any[];
  allNodes: WorkflowNodeType[];
  edges: Edge[];
  nodeOutputData: Record<string, any>;
  onConfigChange: (nodeId: string, config: any) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

// JSON Tree visualization component
function JsonTree({
  data,
  path = "",
  onDragStart,
  expanded = true,
}: {
  data: any;
  path?: string;
  onDragStart?: (path: string, value: any) => void;
  expanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(expanded);

  if (data === null) {
    return <span className="text-orange-400">null</span>;
  }

  if (data === undefined) {
    return <span className="text-muted-foreground">undefined</span>;
  }

  if (typeof data === "boolean") {
    return <span className="text-purple-400">{data.toString()}</span>;
  }

  if (typeof data === "number") {
    return <span className="text-blue-400">{data}</span>;
  }

  if (typeof data === "string") {
    return (
      <span className="text-green-400 break-all">
        &quot;{data.length > 50 ? data.slice(0, 50) + "..." : data}&quot;
      </span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }

    return (
      <div className="space-y-0.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-[10px]">Array[{data.length}]</span>
        </button>
        {isExpanded && (
          <div className="ml-3 border-l border-border/50 pl-2 space-y-0.5">
            {data.slice(0, 10).map((item, index) => (
              <div key={index} className="flex items-start gap-1">
                <span className="text-muted-foreground text-[10px] shrink-0">{index}:</span>
                <JsonTree
                  data={item}
                  path={`${path}[${index}]`}
                  onDragStart={onDragStart}
                  expanded={false}
                />
              </div>
            ))}
            {data.length > 10 && (
              <span className="text-muted-foreground text-[10px]">...+{data.length - 10} more</span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span className="text-muted-foreground">{"{}"}</span>;
    }

    return (
      <div className="space-y-0.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-[10px]">Object{`{${keys.length}}`}</span>
        </button>
        {isExpanded && (
          <div className="ml-3 border-l border-border/50 pl-2 space-y-0.5">
            {keys.map((key) => {
              const itemPath = path ? `${path}.${key}` : key;
              const value = data[key];
              const isSimple = typeof value !== "object" || value === null;

              return (
                <div
                  key={key}
                  className={`group flex items-start gap-1.5 ${onDragStart && isSimple ? "cursor-grab hover:bg-muted/50 -mx-1 px-1 rounded" : ""}`}
                  draggable={onDragStart && isSimple}
                  onDragStart={(e) => {
                    if (onDragStart && isSimple) {
                      e.dataTransfer.setData("application/json-path", itemPath);
                      e.dataTransfer.setData("application/json-value", JSON.stringify(value));
                      e.dataTransfer.effectAllowed = "copy";
                    }
                  }}
                >
                  {onDragStart && isSimple && (
                    <GripVertical className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <span className="text-cyan-400 text-[11px] shrink-0">{key}:</span>
                  <JsonTree
                    data={value}
                    path={itemPath}
                    onDragStart={onDragStart}
                    expanded={false}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return <span className="text-muted-foreground">{String(data)}</span>;
}

// Get upstream nodes connected to this node
function getUpstreamNodes(
  nodeId: string,
  allNodes: WorkflowNodeType[],
  edges: Edge[]
): WorkflowNodeType[] {
  const upstreamNodeIds = edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source);

  return allNodes.filter((n) => upstreamNodeIds.includes(n.id));
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "trigger":
      return <Zap className="h-4 w-4" />;
    case "logic":
      return <GitBranch className="h-4 w-4" />;
    case "action":
      return <Bot className="h-4 w-4" />;
    case "data":
      return <Variable className="h-4 w-4" />;
    case "utility":
      return <Settings className="h-4 w-4" />;
    default:
      return <Database className="h-4 w-4" />;
  }
}

function getCategoryColor(category: string) {
  switch (category) {
    case "trigger":
      return "bg-purple-500/20 text-purple-400";
    case "logic":
      return "bg-blue-500/20 text-blue-400";
    case "action":
      return "bg-green-500/20 text-green-400";
    case "data":
      return "bg-orange-500/20 text-orange-400";
    case "utility":
      return "bg-gray-500/20 text-gray-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function NodeConfigDialog({
  node,
  nodeTypes,
  bots,
  allNodes,
  edges,
  nodeOutputData,
  onConfigChange,
  onDelete,
  onClose,
}: NodeConfigDialogProps) {
  const upstreamNodes = useMemo(
    () => (node ? getUpstreamNodes(node.id, allNodes, edges) : []),
    [node, allNodes, edges]
  );

  // Get input data from upstream nodes
  const inputData = useMemo(() => {
    const data: Record<string, { label: string; data: any }> = {};
    for (const upNode of upstreamNodes) {
      if (nodeOutputData[upNode.id]) {
        data[upNode.id] = {
          label: upNode.data?.label || upNode.id,
          data: nodeOutputData[upNode.id],
        };
      }
    }
    return data;
  }, [upstreamNodes, nodeOutputData]);

  // Output data for current node
  const outputData = node ? nodeOutputData[node.id] : null;

  const handleDragStart = useCallback((path: string, value: any) => {
    // This is handled by the onDragStart in JsonTree
  }, []);

  if (!node) return null;

  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[90vw] w-[1200px] h-[80vh] p-0 gap-0 flex flex-col" showCloseButton={false}>
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(node.data?.category || "")}`}>
              {getCategoryIcon(node.data?.category || "")}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg">{node.data?.label}</DialogTitle>
              <p className="text-xs text-muted-foreground font-mono">{node.data?.nodeType}</p>
            </div>
          </div>
        </DialogHeader>

        {/* 3-Part Horizontal Layout */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Input from previous nodes */}
          <div className="w-1/4 border-r flex flex-col min-h-0">
            <div className="px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground rotate-180" />
                <span className="text-xs font-medium">Input Data</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Drag values to config fields</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {Object.keys(inputData).length === 0 ? (
                  <div className="text-center py-8">
                    <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No input data</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {upstreamNodes.length === 0
                        ? "Connect a node to see input"
                        : "Run workflow to capture data"}
                    </p>
                  </div>
                ) : (
                  Object.entries(inputData).map(([nodeId, { label, data }]) => (
                    <div key={nodeId} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                          {label}
                        </Badge>
                      </div>
                      <div className="text-[11px] font-mono">
                        <JsonTree data={data} onDragStart={handleDragStart} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Middle: Node Configuration */}
          <div className="flex-1 flex flex-col min-h-0 border-r">
            <div className="px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Configuration</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <NodeConfigPanel
                node={node}
                nodeTypes={nodeTypes}
                bots={bots}
                allNodes={allNodes}
                edges={edges}
                nodeOutputData={nodeOutputData}
                onConfigChange={(config) => onConfigChange(node.id, config)}
                onDelete={() => {
                  onDelete(node.id);
                  onClose();
                }}
                hideDelete
              />
              
              {/* Danger Zone Collapsible */}
              <div className="border-t mt-2">
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 text-xs">
                    <div className="flex items-center gap-2 text-destructive/80">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="font-medium">Danger Zone</span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3">
                      <p className="text-[10px] text-muted-foreground mb-2">
                        This action cannot be undone. This will permanently delete the node and all its connections.
                      </p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          onDelete(node.id);
                          onClose();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete Node
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </ScrollArea>
          </div>

          {/* Right: Output from this node */}
          <div className="w-1/4 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Output Data</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3">
                {!outputData ? (
                  <div className="text-center py-8">
                    <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No output yet</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Run workflow to see output
                    </p>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono">
                    <JsonTree data={outputData} expanded={true} />
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

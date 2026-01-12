"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Trash2, ChevronDown, Sparkles, Bot, Database, Info } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WorkflowNodeType, WorkflowNodeData } from "./workflow-node";
import type { Edge } from "@xyflow/react";

interface NodeConfigPanelProps {
  node: WorkflowNodeType;
  nodeTypes: any[];
  bots: any[];
  allNodes: WorkflowNodeType[];
  edges: Edge[];
  nodeOutputData: Record<string, any>;
  onConfigChange: (config: any) => void;
  onDelete: () => void;
  hideDelete?: boolean;
}

// Get upstream nodes (nodes that connect into this node)
function getUpstreamNodes(
  nodeId: string,
  allNodes: WorkflowNodeType[],
  edges: Edge[],
  visited: Set<string> = new Set()
): WorkflowNodeType[] {
  // Prevent infinite recursion on cyclic graphs
  if (visited.has(nodeId)) {
    return [];
  }
  visited.add(nodeId);

  const upstreamNodeIds = edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source);
  
  const upstreamNodes = allNodes.filter((n) => upstreamNodeIds.includes(n.id));
  
  // Recursively get all upstream nodes
  const allUpstream: WorkflowNodeType[] = [...upstreamNodes];
  for (const node of upstreamNodes) {
    const moreUpstream = getUpstreamNodes(node.id, allNodes, edges, visited);
    for (const n of moreUpstream) {
      if (!allUpstream.find((u) => u.id === n.id)) {
        allUpstream.push(n);
      }
    }
  }
  
  return allUpstream;
}

// Extract available fields from node output data
function extractDataFields(data: any, prefix = ""): Array<{ path: string; type: string; sample?: any }> {
  const fields: Array<{ path: string; type: string; sample?: any }> = [];
  
  if (data === null || data === undefined) return fields;
  
  if (typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const type = Array.isArray(value) ? "array" : typeof value;
      
      fields.push({ path, type, sample: value });
      
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        fields.push(...extractDataFields(value, path));
      }
    }
  }
  
  return fields;
}

export function NodeConfigPanel({
  node,
  nodeTypes,
  bots,
  allNodes,
  edges,
  nodeOutputData,
  onConfigChange,
  onDelete,
  hideDelete,
}: NodeConfigPanelProps) {
  const [config, setConfig] = useState<Record<string, any>>(node.data?.config || {});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    settings: true,
    data: false,
  });

  // Find the node type definition
  const nodeTypeDef = nodeTypes.find((t) => t.type === node.data?.nodeType);

  // Get upstream nodes for data reference
  const upstreamNodes = useMemo(
    () => getUpstreamNodes(node.id, allNodes, edges),
    [node.id, allNodes, edges]
  );

  // Build available data references from upstream nodes
  const availableDataRefs = useMemo(() => {
    const refs: Array<{
      nodeId: string;
      nodeLabel: string;
      nodeType: string;
      fields: Array<{ path: string; type: string; sample?: any }>;
    }> = [];

    for (const upNode of upstreamNodes) {
      const outputData = nodeOutputData[upNode.id];
      if (outputData) {
        refs.push({
          nodeId: upNode.id,
          nodeLabel: upNode.data?.label || upNode.id,
          nodeType: upNode.data?.nodeType || "",
          fields: extractDataFields(outputData),
        });
      } else {
        // Show expected output structure from node definition
        const upNodeDef = nodeTypes.find((t) => t.type === upNode.data?.nodeType);
        if (upNodeDef?.outputs) {
          const mockFields: Array<{ path: string; type: string }> = [];
          for (const output of upNodeDef.outputs) {
            mockFields.push({ path: output.id || output.name, type: output.dataType || "any" });
          }
          refs.push({
            nodeId: upNode.id,
            nodeLabel: upNode.data?.label || upNode.id,
            nodeType: upNode.data?.nodeType || "",
            fields: mockFields,
          });
        }
      }
    }

    return refs;
  }, [upstreamNodes, nodeOutputData, nodeTypes]);

  // Update local state when node changes
  useEffect(() => {
    setConfig(node.data?.config || {});
  }, [node.id, node.data?.config]);

  const updateConfig = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Data picker popover for n8n-style selection
  const DataPickerButton = ({ fieldName, onSelect }: { fieldName: string; onSelect: (value: string) => void }) => {
    if (availableDataRefs.length === 0) return null;
    
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <div className="p-2 border-b">
            <p className="text-xs font-medium">Select from previous node</p>
            <p className="text-[10px] text-muted-foreground">Click to use data from connected nodes</p>
          </div>
          <div className="max-h-[200px] overflow-auto">
            {availableDataRefs.map((ref) => (
              <div key={ref.nodeId}>
                <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/50 flex items-center gap-1.5 sticky top-0">
                  <Database className="h-3 w-3" />
                  {ref.nodeLabel}
                </div>
                {ref.fields.length === 0 ? (
                  <div className="px-2 py-2 text-[10px] text-muted-foreground italic">
                    Run workflow to see fields
                  </div>
                ) : (
                  ref.fields.slice(0, 8).map((field) => (
                    <button
                      key={`${ref.nodeId}.${field.path}`}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted flex items-center gap-2"
                      onClick={() => onSelect(`$node.${ref.nodeId}.${field.path}`)}
                    >
                      <span className="font-mono text-[10px] flex-1 truncate">{field.path}</span>
                      <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">
                        {field.type}
                      </Badge>
                    </button>
                  ))
                )}
                {ref.fields.length > 8 && (
                  <div className="px-3 py-1 text-[10px] text-muted-foreground">
                    +{ref.fields.length - 8} more...
                  </div>
                )}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderField = (field: any) => {
    const fieldKey = field.id || field.name;
    const value = config[fieldKey] ?? field.defaultValue ?? field.default ?? "";
    const isExpression = typeof value === "string" && value.startsWith("$");

    // Check for visibility conditions
    if (field.showWhen) {
      const conditionField = field.showWhen.field;
      const conditionValue = field.showWhen.value;
      if (config[conditionField] !== conditionValue) {
        return null;
      }
    }

    switch (field.type) {
      case "select":
        return (
          <Select
            value={value?.toString() || ""}
            onValueChange={(v) => updateConfig(fieldKey, v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={field.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((opt: any) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "bot-select":
        return (
          <Select
            value={value || ""}
            onValueChange={(v) => updateConfig(fieldKey, v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <div className="flex items-center gap-2">
                <Bot className="h-3 w-3 text-muted-foreground" />
                <SelectValue placeholder="Select bot..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              {bots.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  No bots available
                </div>
              ) : (
                bots.map((bot: any) => (
                  <SelectItem key={bot.id} value={bot.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          bot.status === "ONLINE" ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                      <span>{bot.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {bot.serverHost}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );

      case "cron":
        const cronPresets = [
          { label: "Every minute", value: "* * * * *" },
          { label: "Every 5 min", value: "*/5 * * * *" },
          { label: "Every 15 min", value: "*/15 * * * *" },
          { label: "Every hour", value: "0 * * * *" },
          { label: "Every day", value: "0 0 * * *" },
          { label: "Every week", value: "0 0 * * 0" },
        ];
        return (
          <Select
            value={value || ""}
            onValueChange={(v) => updateConfig(fieldKey, v)}
          >
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue placeholder="Select schedule..." />
            </SelectTrigger>
            <SelectContent>
              {cronPresets.map((preset) => (
                <SelectItem key={preset.value} value={preset.value} className="text-xs">
                  <div className="flex items-center justify-between gap-4 w-full">
                    <span>{preset.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {preset.value}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "text":
      case "string":
        // Check for options (makes it a select)
        if (field.options) {
          return (
            <Select
              value={value?.toString() || ""}
              onValueChange={(v) => updateConfig(fieldKey, v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={field.placeholder || "Select..."} />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((opt: any) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        // Allow referencing upstream data
        return (
          <div className="space-y-1">
            <div className="flex gap-1">
              <Input
                value={value}
                onChange={(e) => updateConfig(fieldKey, e.target.value)}
                placeholder={field.placeholder}
                className={`h-8 text-xs flex-1 ${isExpression ? "font-mono bg-purple-500/10 border-purple-500/30" : ""}`}
              />
              <DataPickerButton 
                fieldName={fieldKey} 
                onSelect={(v) => updateConfig(fieldKey, v)} 
              />
            </div>
            {isExpression && (
              <p className="text-[10px] text-purple-400 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Using data from previous node
              </p>
            )}
          </div>
        );

      case "number":
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => updateConfig(fieldKey, Number(e.target.value))}
            placeholder={field.placeholder}
            min={field.validation?.min ?? field.min}
            max={field.validation?.max ?? field.max}
            className="h-8 text-xs"
          />
        );

      case "boolean":
        return (
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-muted-foreground">{field.description}</span>
            <Switch
              checked={!!value}
              onCheckedChange={(checked) => updateConfig(fieldKey, checked)}
            />
          </div>
        );

      case "json":
        return (
          <Textarea
            value={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                updateConfig(fieldKey, JSON.parse(e.target.value));
              } catch {
                updateConfig(fieldKey, e.target.value);
              }
            }}
            placeholder={field.placeholder || "{}"}
            rows={3}
            className="font-mono text-[10px]"
          />
        );

      case "coordinates":
        const coords = value || { x: 0, y: 64, z: 0 };
        return (
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-[10px] text-muted-foreground">X</Label>
              <Input
                type="number"
                value={coords.x || 0}
                onChange={(e) =>
                  updateConfig(fieldKey, { ...coords, x: Number(e.target.value) })
                }
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Y</Label>
              <Input
                type="number"
                value={coords.y || 64}
                onChange={(e) =>
                  updateConfig(fieldKey, { ...coords, y: Number(e.target.value) })
                }
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Z</Label>
              <Input
                type="number"
                value={coords.z || 0}
                onChange={(e) =>
                  updateConfig(fieldKey, { ...coords, z: Number(e.target.value) })
                }
                className="h-7 text-xs"
              />
            </div>
          </div>
        );

      case "expression":
        return (
          <div className="space-y-1">
            <div className="flex gap-1">
              <Input
                value={value}
                onChange={(e) => updateConfig(fieldKey, e.target.value)}
                placeholder={field.placeholder || "$node.id.field"}
                className="font-mono h-8 text-xs flex-1 bg-purple-500/10 border-purple-500/30"
              />
              <DataPickerButton 
                fieldName={fieldKey} 
                onSelect={(v) => updateConfig(fieldKey, v)} 
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Use $node.nodeId.path to reference data
            </p>
          </div>
        );

      default:
        return (
          <div className="flex gap-1">
            <Input
              value={value?.toString() || ""}
              onChange={(e) => updateConfig(fieldKey, e.target.value)}
              placeholder={field.placeholder}
              className="h-8 text-xs flex-1"
            />
            <DataPickerButton 
              fieldName={fieldKey} 
              onSelect={(v) => updateConfig(fieldKey, v)} 
            />
          </div>
        );
    }
  };

  const configFields = nodeTypeDef?.configFields || [];
  const hasConfig = configFields.length > 0;

  return (
    <div className="divide-y divide-border">
      {/* Settings Section */}
      <Collapsible open={openSections.settings} onOpenChange={() => toggleSection("settings")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50">
          <span className="text-xs font-medium">Settings</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openSections.settings ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3">
            {nodeTypeDef?.description && (
              <p className="text-[10px] text-muted-foreground">{nodeTypeDef.description}</p>
            )}
            
            {hasConfig ? (
              configFields.map((field: any) => {
                const rendered = renderField(field);
                if (!rendered) return null;
                
                return (
                  <div key={field.id || field.name} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">
                        {field.name || field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                      </Label>
                      {field.description && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[200px] text-xs">
                              {field.description}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {rendered}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground py-2">No configuration needed</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Input Data Section */}
      {upstreamNodes.length > 0 && (
        <Collapsible open={openSections.data} onOpenChange={() => toggleSection("data")}>
          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">Input Data</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {upstreamNodes.length} {upstreamNodes.length === 1 ? "node" : "nodes"}
              </Badge>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openSections.data ? "" : "-rotate-90"}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 space-y-2">
              {availableDataRefs.length === 0 || availableDataRefs.every(r => r.fields.length === 0) ? (
                <div className="text-center py-4 border border-dashed rounded-md">
                  <Sparkles className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">
                    Run the workflow to capture data
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    Data from previous nodes will appear here
                  </p>
                </div>
              ) : (
                availableDataRefs.map((ref) => (
                  <div key={ref.nodeId} className="border rounded-md overflow-hidden">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50">
                      <Database className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium">{ref.nodeLabel}</span>
                      <Badge variant="outline" className="text-[8px] h-4 px-1 ml-auto">
                        {ref.fields.length} fields
                      </Badge>
                    </div>
                    <div className="p-2 space-y-0.5 max-h-[120px] overflow-auto">
                      {ref.fields.slice(0, 6).map((field) => (
                        <div key={field.path} className="flex items-center gap-2 text-[10px]">
                          <span className="font-mono text-muted-foreground truncate flex-1">{field.path}</span>
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1">{field.type}</Badge>
                          {field.sample !== undefined && typeof field.sample !== "object" && (
                            <span className="text-muted-foreground/70 truncate max-w-[60px]">
                              = {String(field.sample).slice(0, 15)}
                            </span>
                          )}
                        </div>
                      ))}
                      {ref.fields.length > 6 && (
                        <p className="text-[10px] text-muted-foreground pt-1">
                          +{ref.fields.length - 6} more fields
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Delete Section */}
      {!hideDelete && (
        <div className="p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete Node
          </Button>
        </div>
      )}
    </div>
  );
}

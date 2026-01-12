"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  Clock,
  Zap,
  Webhook,
  PlayCircle,
  GitBranch,
  Repeat,
  Timer,
  Split,
  Merge,
  Variable,
  Filter,
  Globe,
  Terminal,
  Square,
  Bot,
  MessageSquare,
  Package,
  Search,
  ArrowRight,
  Eye,
  Footprints,
  Hand,
  Database,
  Box,
  ChefHat,
  CornerDownRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export type NodeExecutionState = "idle" | "waiting" | "running" | "success" | "error";

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: string;
  label: string;
  category: string;
  config: Record<string, any>;
  inputs?: Array<{ name: string; type: string }>;
  outputs?: Array<{ name: string; type: string }>;
  icon?: string;
  executionState?: NodeExecutionState;
}

export type WorkflowNodeType = Node<WorkflowNodeData, "workflowNode">;

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  play: PlayCircle,
  clock: Clock,
  zap: Zap,
  webhook: Webhook,
  "git-branch": GitBranch,
  repeat: Repeat,
  timer: Timer,
  split: Split,
  merge: Merge,
  variable: Variable,
  filter: Filter,
  globe: Globe,
  terminal: Terminal,
  square: Square,
  bot: Bot,
  message: MessageSquare,
  package: Package,
  search: Search,
  "arrow-right": ArrowRight,
  eye: Eye,
  footprints: Footprints,
  hand: Hand,
  database: Database,
  box: Box,
  chef: ChefHat,
  "corner-down-right": CornerDownRight,
};

const categoryStyles: Record<string, { accent: string; iconBg: string; iconColor: string }> = {
  trigger: {
    accent: "border-l-purple-500",
    iconBg: "bg-purple-500/15",
    iconColor: "text-purple-400",
  },
  logic: {
    accent: "border-l-blue-500",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-400",
  },
  action: {
    accent: "border-l-green-500",
    iconBg: "bg-green-500/15",
    iconColor: "text-green-400",
  },
  data: {
    accent: "border-l-orange-500",
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-400",
  },
  utility: {
    accent: "border-l-gray-500",
    iconBg: "bg-gray-500/15",
    iconColor: "text-gray-400",
  },
};

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowNodeType>) {
  const styles = categoryStyles[data.category] || categoryStyles.utility;
  const IconComponent = iconMap[data.icon || "square"] || Square;
  const hasInputs = data.category !== "trigger";
  const hasOutputs = true;
  const executionState = data.executionState || "idle";

  // Get execution state styles
  const getExecutionStyles = () => {
    switch (executionState) {
      case "waiting":
        return "workflow-node-waiting";
      case "running":
        return "workflow-node-running";
      case "success":
        return "border-green-500 shadow-green-500/20 shadow-lg";
      case "error":
        return "border-red-500 shadow-red-500/20 shadow-lg";
      default:
        return "border-border/60 hover:border-border";
    }
  };

  const getStatusIcon = () => {
    switch (executionState) {
      case "waiting":
        return <Clock className="h-3 w-3 animate-pulse text-yellow-400" />;
      case "running":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-400" />;
      case "success":
        return <CheckCircle2 className="h-3 w-3 text-green-400" />;
      case "error":
        return <XCircle className="h-3 w-3 text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "relative px-3 py-2.5 rounded-lg border bg-card min-w-[160px] max-w-[220px] transition-all duration-200",
        "border-l-[3px]",
        styles.accent,
        getExecutionStyles(),
        selected && "ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
      )}
    >
      {/* Input Handle */}
      {hasInputs && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-muted-foreground/60 !border-2 !border-card hover:!bg-primary transition-colors"
        />
      )}

      {/* Node Content */}
      <div className="flex items-start gap-2.5">
        <div className={cn("p-2 rounded-md shrink-0", styles.iconBg)}>
          <IconComponent className={cn("h-4 w-4", styles.iconColor)} />
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate leading-tight">{data.label}</p>
            {getStatusIcon()}
          </div>
          <p className="text-[10px] text-muted-foreground/70 font-mono truncate mt-0.5">
            {data.nodeType}
          </p>
          {data.config?.botId && (
            <p className="text-[10px] text-muted-foreground truncate mt-1">
              Bot: {data.config.botId.slice(0, 8)}...
            </p>
          )}
          {data.config?.cron && (
            <p className="text-[10px] text-muted-foreground truncate mt-1">
              ⏰ {data.config.cron}
            </p>
          )}
          {data.config?.event && (
            <p className="text-[10px] text-muted-foreground truncate mt-1">
              📡 {data.config.event}
            </p>
          )}
        </div>
      </div>

      {/* Output Handle - exclude conditional nodes which have their own handles */}
      {hasOutputs && data.nodeType !== "logic.if" && data.nodeType !== "logic.switch" && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-muted-foreground/60 !border-2 !border-card hover:!bg-primary transition-colors"
        />
      )}

      {/* Multiple outputs for conditional nodes */}
      {(data.nodeType === "logic.if" || data.nodeType === "logic.switch") && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-card !top-1/3"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-card !top-2/3"
          />
        </>
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);

"use client";

import { useState, useEffect } from "react";
import { useWorkflowExecution, useCancelExecution } from "@/hooks/use-workflows";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Play,
  Square,
} from "lucide-react";
import { format } from "date-fns";

interface ExecutionPanelProps {
  workflowId: string;
  executions?: {
    executions: any[];
    total: number;
  };
}

export function ExecutionPanel({ workflowId, executions }: ExecutionPanelProps) {
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const { data: selectedExecution, isLoading: executionLoading } = useWorkflowExecution(
    selectedExecutionId || ""
  );
  const cancelExecution = useCancelExecution();
  const { socket } = useSocket();

  // Listen for real-time execution updates
  useEffect(() => {
    if (!socket || !selectedExecutionId) return;

    const handleExecutionUpdate = (data: any) => {
      if (data.executionId === selectedExecutionId) {
        // Query will auto-refresh due to refetchInterval
      }
    };

    const handleNodeStarted = (data: any) => {
      // Node started event - could be used to update UI state
    };

    const handleNodeCompleted = (data: any) => {
      // Node completed event - could be used to update UI state
    };

    socket.on("workflow:execution:update", handleExecutionUpdate);
    socket.on("workflow:node:started", handleNodeStarted);
    socket.on("workflow:node:completed", handleNodeCompleted);

    return () => {
      socket.off("workflow:execution:update", handleExecutionUpdate);
      socket.off("workflow:node:started", handleNodeStarted);
      socket.off("workflow:node:completed", handleNodeCompleted);
    };
  }, [socket, selectedExecutionId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "FAILED":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "RUNNING":
        return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
      case "PENDING":
        return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
      case "CANCELLED":
        return <Square className="h-3.5 w-3.5 text-gray-500" />;
      default:
        return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClass = "text-[10px] h-4 px-1.5";
    switch (status) {
      case "COMPLETED":
        return <Badge className={`${baseClass} bg-green-500/20 text-green-400 border-green-500/30`}>Done</Badge>;
      case "FAILED":
        return <Badge className={`${baseClass} bg-red-500/20 text-red-400 border-red-500/30`}>Failed</Badge>;
      case "RUNNING":
        return <Badge className={`${baseClass} bg-blue-500/20 text-blue-400 border-blue-500/30`}>Running</Badge>;
      case "PENDING":
        return <Badge className={`${baseClass} bg-yellow-500/20 text-yellow-400 border-yellow-500/30`}>Pending</Badge>;
      case "CANCELLED":
        return <Badge variant="secondary" className={baseClass}>Cancelled</Badge>;
      default:
        return <Badge variant="outline" className={baseClass}>{status}</Badge>;
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "warn":
        return "text-yellow-400";
      case "info":
        return "text-blue-400";
      case "debug":
        return "text-gray-400";
      default:
        return "text-foreground";
    }
  };

  if (selectedExecutionId && selectedExecution) {
    return (
      <div className="p-3 space-y-2">
        {/* Back button and header */}
        <div className="space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedExecutionId(null)}
            className="-ml-1 h-6 text-xs"
          >
            <ChevronRight className="h-3 w-3 mr-0.5 rotate-180" />
            Back
          </Button>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Details</span>
            {getStatusBadge(selectedExecution.status)}
          </div>
        </div>

        <Separator />

        {/* Execution Info */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Started</span>
            <span>{format(new Date(selectedExecution.startedAt), "MMM d, HH:mm:ss")}</span>
          </div>
          {selectedExecution.finishedAt && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Finished</span>
                <span>{format(new Date(selectedExecution.finishedAt), "HH:mm:ss")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>
                  {Math.round(
                    (new Date(selectedExecution.finishedAt).getTime() -
                      new Date(selectedExecution.startedAt).getTime()) /
                      1000
                  )}s
                </span>
              </div>
            </>
          )}
        </div>

        {/* Cancel button for running executions */}
        {selectedExecution.status === "RUNNING" && (
          <Button
            variant="destructive"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => cancelExecution.mutate(selectedExecution.id)}
            disabled={cancelExecution.isPending}
          >
            {cancelExecution.isPending ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Square className="h-3 w-3 mr-1.5" />
            )}
            Cancel
          </Button>
        )}

        {/* Error message */}
        {selectedExecution.error && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-red-400">Error</span>
            <p className="text-[10px] text-red-300 bg-red-500/10 p-1.5 rounded">
              {selectedExecution.error}
            </p>
          </div>
        )}

        {/* Execution Logs */}
        {selectedExecution.logs && selectedExecution.logs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <span className="text-xs font-medium">Logs</span>
              <div className="space-y-0.5">
                {selectedExecution.logs.map((log: any, index: number) => (
                  <Collapsible key={index}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left p-1 rounded hover:bg-muted text-[11px]">
                      <ChevronDown className="h-2.5 w-2.5" />
                      {getStatusIcon(log.status)}
                      <span className="flex-1 truncate">{log.nodeId}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {log.duration ? `${log.duration}ms` : ""}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-4 p-1.5 bg-muted/50 rounded text-[10px] space-y-0.5">
                        {log.input && (
                          <div className="truncate">
                            <span className="text-muted-foreground">In: </span>
                            <code>{JSON.stringify(log.input)}</code>
                          </div>
                        )}
                        {log.output && (
                          <div className="truncate">
                            <span className="text-muted-foreground">Out: </span>
                            <code>{JSON.stringify(log.output)}</code>
                          </div>
                        )}
                        {log.error && (
                          <div className="text-red-400 truncate">
                            <span className="text-muted-foreground">Err: </span>
                            {log.error}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Execution list view
  return (
    <div className="p-2">
      {!executions || executions.executions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
            <Play className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">No executions yet</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">Run the workflow to see history</p>
        </div>
      ) : (
        <div className="space-y-1">
          {executions.executions.map((execution: any) => (
            <div
              key={execution.id}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/80 cursor-pointer transition-colors group"
              onClick={() => setSelectedExecutionId(execution.id)}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                execution.status === 'COMPLETED' ? 'bg-green-500/20' : 
                execution.status === 'FAILED' ? 'bg-red-500/20' : 
                execution.status === 'RUNNING' ? 'bg-blue-500/20' : 'bg-muted'
              }`}>
                {getStatusIcon(execution.status)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">
                  {format(new Date(execution.startedAt), "MMM d, HH:mm:ss")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {execution.triggeredBy || "manual"}
                </p>
              </div>
              {execution.finishedAt && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {Math.round(
                    (new Date(execution.finishedAt).getTime() -
                      new Date(execution.startedAt).getTime()) /
                      1000
                  )}s
                </span>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

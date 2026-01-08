"use client";

import { useState } from "react";
import { useTasks, useCancelTask, useDeleteTask, useUpdateItemDecision } from "@/hooks/use-tasks";
import { ItemIcon } from "@/components/item-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Pause,
  Clock,
  Trash2,
  Package,
  User,
  Box,
  Ban,
  Check,
  X,
} from "lucide-react";

interface TaskListProps {
  botId: string;
  serverVersion?: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  PENDING: { icon: <Clock className="h-3 w-3" />, variant: "secondary", label: "Pending" },
  IN_PROGRESS: { icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: "default", label: "In Progress" },
  PAUSED: { icon: <Pause className="h-3 w-3" />, variant: "outline", label: "Paused" },
  COMPLETED: { icon: <CheckCircle className="h-3 w-3" />, variant: "default", label: "Completed" },
  FAILED: { icon: <XCircle className="h-3 w-3" />, variant: "destructive", label: "Failed" },
  CANCELLED: { icon: <Ban className="h-3 w-3" />, variant: "secondary", label: "Cancelled" },
};

const deliveryMethodLabels: Record<string, { icon: React.ReactNode; label: string }> = {
  DROP_TO_PLAYER: { icon: <User className="h-3 w-3" />, label: "Drop to Player" },
  PUT_IN_CHEST: { icon: <Box className="h-3 w-3" />, label: "Put in Chest" },
  SHULKER_DROP: { icon: <Package className="h-3 w-3" />, label: "Shulker → Player" },
  SHULKER_CHEST: { icon: <Package className="h-3 w-3" />, label: "Shulker → Chest" },
};

export function TaskList({ botId, serverVersion = "1.21.4" }: TaskListProps) {
  const { data: tasks, isLoading } = useTasks(botId);
  const cancelTask = useCancelTask();
  const deleteTask = useDeleteTask();
  const updateDecision = useUpdateItemDecision();
  
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No active requests. Select items and click "Request Items" to create one.
      </div>
    );
  }

  const toggleExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleCancel = (taskId: string) => {
    cancelTask.mutate(taskId);
  };

  const handleDelete = (taskId: string, botId: string) => {
    deleteTask.mutate({ taskId, botId }, {
      onSuccess: () => setTaskToDelete(null),
    });
  };

  const handleItemDecision = (taskId: string, itemId: string, decision: "take_available" | "skip") => {
    updateDecision.mutate({ taskId, itemId, decision });
  };

  const activeTasks = tasks.filter((t: any) => ["PENDING", "IN_PROGRESS", "PAUSED"].includes(t.status));
  const completedTasks = tasks.filter((t: any) => ["COMPLETED", "FAILED", "CANCELLED"].includes(t.status));

  return (
    <div className="space-y-4">
      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Active Requests</h3>
          <div className="space-y-2">
            {activeTasks.map((task: any) => (
              <TaskCard
                key={task.id}
                task={task}
                expanded={expandedTasks.has(task.id)}
                onToggle={() => toggleExpanded(task.id)}
                onCancel={() => handleCancel(task.id)}
                onDelete={() => setTaskToDelete(task.id)}
                onItemDecision={(itemId, decision) => handleItemDecision(task.id, itemId, decision)}
                serverVersion={serverVersion}
                isUpdating={cancelTask.isPending && cancelTask.variables === task.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Completed Requests</h3>
          <div className="space-y-2">
            {completedTasks.map((task: any) => (
              <TaskCard
                key={task.id}
                task={task}
                expanded={expandedTasks.has(task.id)}
                onToggle={() => toggleExpanded(task.id)}
                onCancel={() => handleCancel(task.id)}
                onDelete={() => setTaskToDelete(task.id)}
                onItemDecision={(itemId, decision) => handleItemDecision(task.id, itemId, decision)}
                serverVersion={serverVersion}
                isUpdating={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the request and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => taskToDelete && handleDelete(taskToDelete, botId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TaskCardProps {
  task: any;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onItemDecision: (itemId: string, decision: "take_available" | "skip") => void;
  serverVersion: string;
  isUpdating: boolean;
}

function TaskCard({
  task,
  expanded,
  onToggle,
  onCancel,
  onDelete,
  onItemDecision,
  serverVersion,
  isUpdating,
}: TaskCardProps) {
  const status = statusConfig[task.status] || statusConfig.PENDING;
  const delivery = deliveryMethodLabels[task.deliveryMethod] || deliveryMethodLabels.DROP_TO_PLAYER;
  const isPaused = task.status === "PAUSED";
  const isActive = ["PENDING", "IN_PROGRESS"].includes(task.status);
  const isComplete = ["COMPLETED", "FAILED", "CANCELLED"].includes(task.status);

  // Calculate progress
  const totalItems = task.items?.reduce((sum: number, i: any) => sum + i.requestedCount, 0) || 0;
  const collectedItems = task.items?.reduce((sum: number, i: any) => sum + i.collectedCount, 0) || 0;
  const progressPercent = totalItems > 0 ? (collectedItems / totalItems) * 100 : 0;

  // Items needing decision
  const itemsNeedingDecision = task.items?.filter(
    (i: any) => i.status === "PARTIAL" && !i.userDecision && isPaused
  ) || [];

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        isPaused ? "border-yellow-500/50 bg-yellow-500/5" : ""
      }`}
    >
      <Collapsible open={expanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              
              <div className="flex items-center gap-2">
                <Badge variant={status.variant} className="gap-1">
                  {status.icon}
                  {status.label}
                </Badge>
                <div className="flex items-center gap-1 text-muted-foreground">
                  {delivery.icon}
                  <span className="text-xs">{delivery.label}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Progress indicator */}
              {isActive && (
                <div className="flex items-center gap-2">
                  <Progress value={progressPercent} className="w-24 h-2" />
                  <span className="text-xs text-muted-foreground">
                    {collectedItems}/{totalItems}
                  </span>
                </div>
              )}

              {/* Shulker progress */}
              {task.deliveryMethod?.includes("SHULKER") && task.shulkersFilled > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Package className="h-3 w-3" />
                  {task.shulkersFilled}/{task.shulkersTotal}
                </Badge>
              )}

              {/* Warning for paused */}
              {isPaused && itemsNeedingDecision.length > 0 && (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/50 gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Action Needed
                </Badge>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {isActive && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onCancel}
                        disabled={isUpdating}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel</TooltipContent>
                  </Tooltip>
                )}
                {isComplete && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive"
                        onClick={onDelete}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3 border-t pt-3">
            {/* Current Step */}
            {task.currentStep && isActive && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">{task.currentStep}</span>
              </div>
            )}

            {/* Error message */}
            {task.status === "FAILED" && task.error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                <span>{task.error}</span>
              </div>
            )}

            {/* Items needing decision */}
            {isPaused && itemsNeedingDecision.length > 0 && (
              <div className="space-y-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                <div className="text-sm font-medium text-yellow-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Some items are not fully available
                </div>
                <div className="space-y-2">
                  {itemsNeedingDecision.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between bg-background/50 rounded-md p-2"
                    >
                      <div className="flex items-center gap-2">
                        <ItemIcon
                          itemId={item.itemId}
                          itemName={item.itemName}
                          size={24}
                          version={serverVersion}
                        />
                        <div>
                          <div className="text-sm">{item.itemName}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.collectedCount} of {item.requestedCount} available
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => onItemDecision(item.id, "take_available")}
                            >
                              <Check className="h-3 w-3" />
                              Take {item.collectedCount}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Take what's available</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => onItemDecision(item.id, "skip")}
                            >
                              <X className="h-3 w-3" />
                              Skip
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Skip this item</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Items */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Items</div>
              <ScrollArea className="max-h-[150px]">
                <div className="flex flex-wrap gap-2">
                  {task.items?.map((item: any) => (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                            item.status === "COLLECTED"
                              ? "bg-green-500/10 text-green-600"
                              : item.status === "PARTIAL"
                              ? "bg-yellow-500/10 text-yellow-600"
                              : item.status === "SKIPPED"
                              ? "bg-muted text-muted-foreground line-through"
                              : "bg-muted/50"
                          }`}
                        >
                          <ItemIcon
                            itemId={item.itemId}
                            itemName={item.itemName}
                            size={16}
                            version={serverVersion}
                          />
                          <span>
                            {item.collectedCount}/{item.requestedCount}
                          </span>
                          {item.status === "COLLECTED" && (
                            <CheckCircle className="h-3 w-3" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{item.itemName}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Delivery info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {task.targetPlayer && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {task.targetPlayer}
                </div>
              )}
              {task.deliveryX !== null && (
                <div className="flex items-center gap-1">
                  <Box className="h-3 w-3" />
                  {task.deliveryX}, {task.deliveryY}, {task.deliveryZ}
                </div>
              )}
              <div>
                Created {new Date(task.createdAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getSocket } from "@/lib/socket";
import { toast } from "sonner";

export function useTasks(botId: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  // Track active task toasts by task ID
  const activeToastsRef = useRef<Map<string, string>>(new Map());

  // Listen for real-time task updates
  useEffect(() => {
    if (!token || !botId) return;

    const socket = getSocket(token);

    const handleTaskCreated = (data: { task: any }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", botId] });
    };

    const handleTaskUpdated = (data: { task: any }) => {
      queryClient.setQueryData(["tasks", botId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((t) => (t.id === data.task.id ? data.task : t));
      });
      
      // Show/update toast for IN_PROGRESS tasks
      if (data.task.status === "IN_PROGRESS") {
        const toastId = `task-${data.task.id}`;
        activeToastsRef.current.set(data.task.id, toastId);
        
        const itemCount = data.task.items?.length || 0;
        const collectedItems = data.task.collectedItems || 0;
        const totalItems = data.task.totalItems || 0;
        
        toast.loading(
          `Collecting items... ${collectedItems}/${totalItems}`,
          {
            id: toastId,
            description: data.task.currentStep || "Starting...",
            duration: Infinity,
          }
        );
      }
    };

    const handleTaskStep = (data: { taskId: string; step: string }) => {
      const toastId = activeToastsRef.current.get(data.taskId);
      if (toastId) {
        toast.loading(
          "Processing request...",
          {
            id: toastId,
            description: data.step,
            duration: Infinity,
          }
        );
      }
      queryClient.invalidateQueries({ queryKey: ["tasks", botId] });
    };

    const handleTaskProgress = (data: { taskId: string; itemId?: string; collected?: number; remaining?: number }) => {
      const toastId = activeToastsRef.current.get(data.taskId);
      if (toastId && data.itemId) {
        // Get current task data to show better progress
        const tasks = queryClient.getQueryData<any[]>(["tasks", botId]);
        const task = tasks?.find((t) => t.id === data.taskId);
        
        if (task) {
          const collectedItems = (task.collectedItems || 0) + (data.collected || 0);
          const totalItems = task.totalItems || 0;
          const progress = totalItems > 0 ? Math.round((collectedItems / totalItems) * 100) : 0;
          
          toast.loading(
            `Collecting items... ${progress}%`,
            {
              id: toastId,
              description: `${collectedItems}/${totalItems} items collected`,
              duration: Infinity,
            }
          );
        }
      }
      queryClient.invalidateQueries({ queryKey: ["tasks", botId] });
    };

    const handleTaskCompleted = (data: { task: any }) => {
      queryClient.setQueryData(["tasks", botId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((t) => (t.id === data.task.id ? data.task : t));
      });
      
      // Dismiss loading toast and show success
      const toastId = activeToastsRef.current.get(data.task.id);
      if (toastId) {
        toast.success("Request completed!", {
          id: toastId,
          description: `Delivered ${data.task.collectedItems || 0} items`,
          duration: 4000,
        });
        activeToastsRef.current.delete(data.task.id);
      }
    };

    const handleTaskFailed = (data: { task: any; error?: string }) => {
      queryClient.setQueryData(["tasks", botId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((t) => (t.id === data.task.id ? data.task : t));
      });
      
      // Dismiss loading toast and show error
      const toastId = activeToastsRef.current.get(data.task.id);
      if (toastId) {
        toast.error("Request failed", {
          id: toastId,
          description: data.error || data.task.errorMessage || "Unknown error",
          duration: 5000,
        });
        activeToastsRef.current.delete(data.task.id);
      }
    };

    const handleTaskDeleted = (data: { taskId: string }) => {
      queryClient.setQueryData(["tasks", botId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.filter((t) => t.id !== data.taskId);
      });
      
      // Dismiss any active toast for deleted task
      const toastId = activeToastsRef.current.get(data.taskId);
      if (toastId) {
        toast.dismiss(toastId);
        activeToastsRef.current.delete(data.taskId);
      }
    };

    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:completed", handleTaskCompleted);
    socket.on("task:failed", handleTaskFailed);
    socket.on("task:deleted", handleTaskDeleted);
    socket.on("task:progress", handleTaskProgress);
    socket.on("task:step", handleTaskStep);
    socket.on("task:shulkerFilled", handleTaskProgress);

    return () => {
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:completed", handleTaskCompleted);
      socket.off("task:failed", handleTaskFailed);
      socket.off("task:deleted", handleTaskDeleted);
      socket.off("task:progress", handleTaskProgress);
      socket.off("task:step", handleTaskStep);
      socket.off("task:shulkerFilled", handleTaskProgress);
      
      // Dismiss any active loading toasts on cleanup to prevent orphaned toasts
      activeToastsRef.current.forEach((toastId) => {
        toast.dismiss(toastId);
      });
      activeToastsRef.current.clear();
    };
  }, [token, botId, queryClient]);

  return useQuery({
    queryKey: ["tasks", botId],
    queryFn: () => tasksApi.listForBot(token!, botId),
    enabled: !!token && !!botId,
    refetchInterval: 5000, // Fallback polling
  });
}

export function useCreateTask() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof tasksApi.create>[1]) =>
      tasksApi.create(token!, data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", data.botId] });
    },
  });
}

export function useUpdateItemDecision() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      itemId,
      decision,
    }: {
      taskId: string;
      itemId: string;
      decision: "take_available" | "skip";
    }) => tasksApi.updateItemDecision(token!, taskId, itemId, decision),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", task.botId] });
    },
  });
}

export function useCancelTask() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => tasksApi.cancel(token!, taskId),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", task.botId] });
    },
  });
}

export function useDeleteTask() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, botId }: { taskId: string; botId: string }) =>
      tasksApi.delete(token!, taskId),
    onSuccess: (_, { botId }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", botId] });
    },
  });
}

export function useEmptyShulkers(storageId: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  // Listen for storage updates to refresh empty shulkers
  useEffect(() => {
    if (!token || !storageId) return;

    const socket = getSocket(token);

    const handleStorageUpdate = (data: { storageId?: string }) => {
      if (data.storageId === storageId || !data.storageId) {
        queryClient.invalidateQueries({ queryKey: ["empty-shulkers", storageId] });
      }
    };

    socket.on("storage:indexComplete", handleStorageUpdate);
    socket.on("storage:chestIndexed", handleStorageUpdate);

    return () => {
      socket.off("storage:indexComplete", handleStorageUpdate);
      socket.off("storage:chestIndexed", handleStorageUpdate);
    };
  }, [token, storageId, queryClient]);

  return useQuery({
    queryKey: ["empty-shulkers", storageId],
    queryFn: () => tasksApi.getEmptyShulkers(token!, storageId),
    enabled: !!token && !!storageId,
    staleTime: 0, // Always check if stale
  });
}

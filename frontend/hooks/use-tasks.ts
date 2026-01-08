"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getSocket } from "@/lib/socket";

export function useTasks(botId: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

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
    };

    const handleTaskCompleted = (data: { task: any }) => {
      queryClient.setQueryData(["tasks", botId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((t) => (t.id === data.task.id ? data.task : t));
      });
    };

    const handleTaskFailed = (data: { task: any }) => {
      queryClient.setQueryData(["tasks", botId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((t) => (t.id === data.task.id ? data.task : t));
      });
    };

    const handleTaskDeleted = (data: { taskId: string }) => {
      queryClient.setQueryData(["tasks", botId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.filter((t) => t.id !== data.taskId);
      });
    };

    const handleTaskProgress = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", botId] });
    };

    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:completed", handleTaskCompleted);
    socket.on("task:failed", handleTaskFailed);
    socket.on("task:deleted", handleTaskDeleted);
    socket.on("task:progress", handleTaskProgress);
    socket.on("task:step", handleTaskProgress);
    socket.on("task:shulkerFilled", handleTaskProgress);

    return () => {
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:completed", handleTaskCompleted);
      socket.off("task:failed", handleTaskFailed);
      socket.off("task:deleted", handleTaskDeleted);
      socket.off("task:progress", handleTaskProgress);
      socket.off("task:step", handleTaskProgress);
      socket.off("task:shulkerFilled", handleTaskProgress);
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

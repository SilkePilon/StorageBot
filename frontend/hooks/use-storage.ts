"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storageApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getSocket } from "@/lib/socket";

export function useStorageSystems(botId: string) {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["storage-systems", botId],
    queryFn: () => storageApi.listForBot(token!, botId),
    enabled: !!token && !!botId,
  });
}

export function useStorageSystem(id: string) {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["storage-system", id],
    queryFn: () => storageApi.get(token!, id),
    enabled: !!token && !!id,
  });
}

export function useUpdateStorageSystem() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { returnToHome?: boolean; name?: string; radius?: number } }) =>
      storageApi.update(token!, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["storage-system", id] });
      queryClient.invalidateQueries({ queryKey: ["storage-systems"] });
    },
  });
}

export function useCreateStorageSystem() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      botId: string;
      centerX: number;
      centerY: number;
      centerZ: number;
      radius?: number;
    }) => storageApi.create(token!, data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["storage-systems", data.botId] });
    },
  });
}

export function useStartIndexing() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => storageApi.startIndex(token!, id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["storage-system", id] });
    },
  });
}

export function useStopIndexing() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => storageApi.stopIndex(token!, id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["storage-system", id] });
    },
  });
}

export function useStorageItems(id: string, search?: string, botId?: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  // Listen for real-time updates
  useEffect(() => {
    if (!token || !id) return;

    const socket = getSocket(token);

    const handleChestIndexed = (data: { storageId?: string; botId?: string }) => {
      if (data.storageId === id || data.botId === botId) {
        queryClient.invalidateQueries({ queryKey: ["storage-items", id] });
      }
    };

    const handleIndexComplete = (data: { storageId?: string; botId?: string }) => {
      if (data.storageId === id || data.botId === botId) {
        queryClient.invalidateQueries({ queryKey: ["storage-items", id] });
        queryClient.invalidateQueries({ queryKey: ["empty-shulkers", id] });
      }
    };

    const handleItemUpdated = (data: { storageId?: string }) => {
      if (data.storageId === id) {
        queryClient.invalidateQueries({ queryKey: ["storage-items", id] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats", id] });
      }
    };

    socket.on("storage:chestIndexed", handleChestIndexed);
    socket.on("storage:indexComplete", handleIndexComplete);
    socket.on("storage:itemUpdated", handleItemUpdated);

    return () => {
      socket.off("storage:chestIndexed", handleChestIndexed);
      socket.off("storage:indexComplete", handleIndexComplete);
      socket.off("storage:itemUpdated", handleItemUpdated);
    };
  }, [token, id, botId, queryClient]);

  return useQuery({
    queryKey: ["storage-items", id, search],
    queryFn: () => storageApi.getItems(token!, id, search),
    enabled: !!token && !!id,
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
    staleTime: 1000, // Consider data fresh for 1 second
  });
}

export function useStorageChests(id: string) {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["storage-chests", id],
    queryFn: () => storageApi.getChests(token!, id),
    enabled: !!token && !!id,
  });
}

export function useStorageStats(id: string, botId?: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  // Listen for real-time stats updates
  useEffect(() => {
    if (!token || !botId) return;

    const socket = getSocket(token);

    const handleStatsUpdated = (data: { storageId: string }) => {
      if (data.storageId === id) {
        queryClient.invalidateQueries({ queryKey: ["storage-stats", id] });
      }
    };

    const handleChestIndexed = (data: { storageId: string }) => {
      if (data.storageId === id) {
        queryClient.invalidateQueries({ queryKey: ["storage-stats", id] });
        queryClient.invalidateQueries({ queryKey: ["storage-items", id] });
      }
    };

    socket.on("storage:statsUpdated", handleStatsUpdated);
    socket.on("storage:chestIndexed", handleChestIndexed);

    return () => {
      socket.off("storage:statsUpdated", handleStatsUpdated);
      socket.off("storage:chestIndexed", handleChestIndexed);
    };
  }, [token, id, botId, queryClient]);

  return useQuery({
    queryKey: ["storage-stats", id],
    queryFn: () => storageApi.getStats(token!, id),
    enabled: !!token && !!id,
  });
}

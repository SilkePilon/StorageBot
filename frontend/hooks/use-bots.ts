"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { botsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { BotType } from "@/lib/bot-types";

export function useBots() {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["bots"],
    queryFn: () => botsApi.list(token!),
    enabled: !!token,
  });
}

export function usePublicBots() {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["public-bots"],
    queryFn: () => botsApi.listPublic(token!),
    enabled: !!token,
  });
}

export function useBotTypes() {
  return useQuery<BotType[]>({
    queryKey: ["bot-types"],
    queryFn: async () => {
      const response = await botsApi.getTypes();
      return response.types;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (bot types rarely change)
  });
}

export function useBot(id: string) {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["bot", id],
    queryFn: () => botsApi.get(token!, id),
    enabled: !!token && !!id,
  });
}

export function useCreateBot() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; botType?: string; useOfflineAccount?: boolean; offlineUsername?: string }) => botsApi.create(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });
}

export function useUpdateBot() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      botsApi.update(token!, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
    },
  });
}

export function useSetBotVisibility() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      botsApi.setVisibility(token!, id, isPublic),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
    },
  });
}

export function useDeleteBot() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => botsApi.delete(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });
}

export function useStartBotAuth() {
  const token = useAuthStore((state) => state.token);

  return useMutation({
    mutationFn: (id: string) => botsApi.startAuth(token!, id),
  });
}

export function useForceReauth() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => botsApi.forceReauth(token!, id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
    },
  });
}

export function useConnectBot() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { serverHost: string; serverPort: number; serverVersion?: string | null };
    }) => botsApi.connect(token!, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
    },
  });
}

export function useDisconnectBot() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => botsApi.disconnect(token!, id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
    },
  });
}

export function useBotStatus(id: string) {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["bot-status", id],
    queryFn: () => botsApi.getStatus(token!, id),
    enabled: !!token && !!id,
    refetchInterval: 5000,
  });
}

export function useMoveBotTo() {
  const token = useAuthStore((state) => state.token);

  return useMutation({
    mutationFn: ({
      id,
      x,
      y,
      z,
    }: {
      id: string;
      x: number;
      y: number;
      z: number;
    }) => botsApi.goto(token!, id, { x, y, z }),
  });
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { workflowsApi } from "@/lib/api";

export function useWorkflows() {
  const token = useAuthStore((state) => state.token);
  
  return useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(token!),
    enabled: !!token,
  });
}

export function useWorkflow(id: string) {
  const token = useAuthStore((state) => state.token);
  
  return useQuery({
    queryKey: ["workflow", id],
    queryFn: () => workflowsApi.get(token!, id),
    enabled: !!token && !!id,
  });
}

export function useWorkflowNodeTypes() {
  const token = useAuthStore((state) => state.token);
  
  return useQuery({
    queryKey: ["workflow-node-types"],
    queryFn: () => workflowsApi.getNodeTypes(token!),
    enabled: !!token,
    staleTime: 1000 * 60 * 60, // 1 hour - node types rarely change
  });
}

export function useCreateWorkflow() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name: string; description?: string; definition?: any }) =>
      workflowsApi.create(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useUpdateWorkflow() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string; definition?: any; status?: string } }) =>
      workflowsApi.update(token!, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflow", id] });
    },
  });
}

export function useDeleteWorkflow() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => workflowsApi.delete(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useRunWorkflow() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: any }) =>
      workflowsApi.run(token!, id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["workflow-executions", id] });
    },
  });
}

export function useWorkflowExecutions(workflowId: string, limit = 20, offset = 0) {
  const token = useAuthStore((state) => state.token);
  
  return useQuery({
    queryKey: ["workflow-executions", workflowId, limit, offset],
    queryFn: () => workflowsApi.getExecutions(token!, workflowId, limit, offset),
    enabled: !!token && !!workflowId,
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

export function useWorkflowExecution(executionId: string) {
  const token = useAuthStore((state) => state.token);
  
  return useQuery({
    queryKey: ["workflow-execution", executionId],
    queryFn: () => workflowsApi.getExecution(token!, executionId),
    enabled: !!token && !!executionId,
    refetchInterval: (query) => {
      // Stop polling when execution is complete
      const data = query.state.data;
      if (data?.status === 'COMPLETED' || data?.status === 'FAILED' || data?.status === 'CANCELLED') {
        return false;
      }
      return 1000; // Poll every second while running
    },
  });
}

export function useCancelExecution() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (executionId: string) =>
      workflowsApi.cancelExecution(token!, executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: ["workflow-execution", executionId] });
    },
  });
}

export function useExportWorkflow() {
  const token = useAuthStore((state) => state.token);
  
  return useMutation({
    mutationFn: (id: string) => workflowsApi.export(token!, id),
  });
}

export function useImportWorkflow() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => workflowsApi.import(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useDuplicateWorkflow() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => workflowsApi.duplicate(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ApiOptions extends RequestInit {
  token?: string;
}

async function fetchApi<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Request failed");
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Auth
export const authApi = {
  register: (data: { username: string; password: string }) =>
    fetchApi<{ user: any; token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { username: string; password: string }) =>
    fetchApi<{ user: any; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMe: (token: string) =>
    fetchApi<any>("/api/auth/me", { token }),
};

// Bots
export const botsApi = {
  list: (token: string) =>
    fetchApi<any[]>("/api/bots", { token }),

  listPublic: (token: string) =>
    fetchApi<any[]>("/api/bots/public", { token }),

  create: (token: string, data: { name: string; useOfflineAccount?: boolean; offlineUsername?: string }) =>
    fetchApi<any>("/api/bots", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  get: (token: string, id: string) =>
    fetchApi<any>(`/api/bots/${id}`, { token }),

  update: (token: string, id: string, data: any) =>
    fetchApi<any>(`/api/bots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    }),

  setVisibility: (token: string, id: string, isPublic: boolean) =>
    fetchApi<any>(`/api/bots/${id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ isPublic }),
      token,
    }),

  delete: (token: string, id: string) =>
    fetchApi<void>(`/api/bots/${id}`, {
      method: "DELETE",
      token,
    }),

  startAuth: (token: string, id: string) =>
    fetchApi<any>(`/api/bots/${id}/auth/start`, {
      method: "POST",
      token,
    }),

  getAuthStatus: (token: string, id: string) =>
    fetchApi<any>(`/api/bots/${id}/auth/status`, { token }),

  connect: (
    token: string,
    id: string,
    data: { serverHost: string; serverPort: number; serverVersion?: string | null }
  ) =>
    fetchApi<any>(`/api/bots/${id}/connect`, {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  disconnect: (token: string, id: string) =>
    fetchApi<any>(`/api/bots/${id}/disconnect`, {
      method: "POST",
      token,
    }),

  getStatus: (token: string, id: string) =>
    fetchApi<any>(`/api/bots/${id}/status`, { token }),

  goto: (token: string, id: string, data: { x: number; y: number; z: number }) =>
    fetchApi<any>(`/api/bots/${id}/goto`, {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),
};

// Storage
export const storageApi = {
  listForBot: (token: string, botId: string) =>
    fetchApi<any[]>(`/api/storage/bot/${botId}`, { token }),

  create: (
    token: string,
    data: {
      name: string;
      botId: string;
      centerX: number;
      centerY: number;
      centerZ: number;
      radius?: number;
    }
  ) =>
    fetchApi<any>("/api/storage", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  get: (token: string, id: string) =>
    fetchApi<any>(`/api/storage/${id}`, { token }),

  update: (token: string, id: string, data: any) =>
    fetchApi<any>(`/api/storage/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    fetchApi<void>(`/api/storage/${id}`, {
      method: "DELETE",
      token,
    }),

  startIndex: (token: string, id: string) =>
    fetchApi<any>(`/api/storage/${id}/index`, {
      method: "POST",
      token,
    }),

  stopIndex: (token: string, id: string) =>
    fetchApi<any>(`/api/storage/${id}/stop-index`, {
      method: "POST",
      token,
    }),

  getItems: (token: string, id: string, search?: string) =>
    fetchApi<any>(`/api/storage/${id}/items${search ? `?search=${search}` : ""}`, {
      token,
    }),

  getChests: (token: string, id: string) =>
    fetchApi<any[]>(`/api/storage/${id}/chests`, { token }),

  getStats: (token: string, id: string) =>
    fetchApi<{
      totalSlots: number;
      usedSlots: number;
      freeSlots: number;
      totalItems: number;
      uniqueItemTypes: number;
      chestCount: number;
      blockCount: number;
      itemCount: number;
      usagePercent: number;
    }>(`/api/storage/${id}/stats`, { token }),
};

// Tasks
export const tasksApi = {
  listForBot: (token: string, botId: string) =>
    fetchApi<any[]>(`/api/tasks/bot/${botId}`, { token }),

  get: (token: string, id: string) =>
    fetchApi<any>(`/api/tasks/${id}`, { token }),

  create: (
    token: string,
    data: {
      botId: string;
      storageSystemId: string;
      name?: string;
      deliveryMethod: 'DROP_TO_PLAYER' | 'PUT_IN_CHEST' | 'SHULKER_DROP' | 'SHULKER_CHEST';
      packingMode?: 'SELECTION_ORDER' | 'OPTIMIZED';
      targetPlayer?: string;
      deliveryX?: number;
      deliveryY?: number;
      deliveryZ?: number;
      selectedShulkerIds?: string[];
      items: { 
        itemId: string; 
        itemName: string; 
        requestedCount: number;
        // Optional shulker source info
        fromShulker?: boolean;
        shulkerContentId?: string;
        shulkerChestItemId?: string;
        shulkerSlotInChest?: number;
        slotInShulker?: number;
        chestX?: number;
        chestY?: number;
        chestZ?: number;
      }[];
    }
  ) =>
    fetchApi<any>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  updateItemDecision: (
    token: string,
    taskId: string,
    itemId: string,
    decision: 'take_available' | 'skip'
  ) =>
    fetchApi<any>(`/api/tasks/${taskId}/items/${itemId}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ decision }),
      token,
    }),

  cancel: (token: string, id: string) =>
    fetchApi<any>(`/api/tasks/${id}/cancel`, {
      method: "POST",
      token,
    }),

  delete: (token: string, id: string) =>
    fetchApi<void>(`/api/tasks/${id}`, {
      method: "DELETE",
      token,
    }),

  getEmptyShulkers: (token: string, storageId: string) =>
    fetchApi<any[]>(`/api/tasks/storage/${storageId}/empty-shulkers`, { token }),
};

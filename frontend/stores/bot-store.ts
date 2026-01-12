import { create } from "zustand";

interface StatusEffect {
  id: number;
  name: string;
  amplifier: number;
  duration: number; // in ticks (20 ticks = 1 second)
}

interface BotStatus {
  connected: boolean;
  spawned: boolean;
  health?: number;
  food?: number;
  position?: { x: number; y: number; z: number };
  dimension?: string;
  gameMode?: string;
  serverVersion?: string;
  currentAction?: string;
  effects?: StatusEffect[];
}

interface BotState {
  selectedBotId: string | null;
  expandedBotId: string | null;
  botStatuses: Record<string, BotStatus>;
  setSelectedBot: (botId: string | null) => void;
  setExpandedBot: (botId: string | null) => void;
  updateBotStatus: (botId: string, status: BotStatus) => void;
  clearBotStatus: (botId: string) => void;
}

export const useBotStore = create<BotState>()((set) => ({
  selectedBotId: null,
  expandedBotId: null,
  botStatuses: {},
  setSelectedBot: (botId) => set({ selectedBotId: botId }),
  setExpandedBot: (botId) => set({ expandedBotId: botId }),
  updateBotStatus: (botId, status) =>
    set((state) => ({
      botStatuses: { ...state.botStatuses, [botId]: status },
    })),
  clearBotStatus: (botId) =>
    set((state) => {
      const { [botId]: _, ...rest } = state.botStatuses;
      return { botStatuses: rest };
    }),
}));

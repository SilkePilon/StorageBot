"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket, subscribeToBot, unsubscribeFromBot, disconnectSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useBotStore } from "@/stores/bot-store";
import type { Socket } from "socket.io-client";

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const token = useAuthStore((state) => state.token);
  const updateBotStatus = useBotStore((state) => state.updateBotStatus);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const s = getSocket(token);
    setSocket(s);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onBotStatus = (data: { botId?: string } & any) => {
      if (data.botId) {
        updateBotStatus(data.botId, data);
      }
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("bot:status", onBotStatus);

    if (s.connected) {
      setIsConnected(true);
    }

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("bot:status", onBotStatus);
    };
  }, [token, updateBotStatus]);

  const subscribeTo = useCallback((botId: string) => {
    subscribeToBot(botId);
  }, []);

  const unsubscribeFrom = useCallback((botId: string) => {
    unsubscribeFromBot(botId);
  }, []);

  return { socket, isConnected, subscribeTo, unsubscribeFrom };
}

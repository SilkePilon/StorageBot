"use client";

import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let socket: Socket | null = null;
let pendingSubscriptions: Set<string> = new Set();

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
    });

    socket.on("connect", () => {
      console.log("Socket connected");
      // Re-subscribe to any pending/previous subscriptions after reconnect
      pendingSubscriptions.forEach((botId) => {
        console.log(`Re-subscribing to bot:${botId}`);
        socket?.emit("bot:subscribe", botId);
      });
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  pendingSubscriptions.clear();
}

export function subscribeToBot(botId: string): void {
  // Track this subscription so we can re-subscribe after reconnect
  pendingSubscriptions.add(botId);
  
  if (socket) {
    if (socket.connected) {
      socket.emit("bot:subscribe", botId);
    }
    // If not connected, the connect handler will emit the subscription
  }
}

export function unsubscribeFromBot(botId: string): void {
  pendingSubscriptions.delete(botId);
  
  if (socket && socket.connected) {
    socket.emit("bot:unsubscribe", botId);
  }
}

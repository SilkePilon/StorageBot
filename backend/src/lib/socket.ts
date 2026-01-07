import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/index.js';
import jwt from 'jsonwebtoken';

let io: Server | null = null;

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.frontendUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`Client connected: ${socket.id} (User: ${socket.userId})`);

    // Join user-specific room for targeted events
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });

    // Bot-specific room joining
    socket.on('bot:subscribe', (botId: string) => {
      socket.join(`bot:${botId}`);
      console.log(`Socket ${socket.id} subscribed to bot:${botId}`);
    });

    socket.on('bot:unsubscribe', (botId: string) => {
      socket.leave(`bot:${botId}`);
      console.log(`Socket ${socket.id} unsubscribed from bot:${botId}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

// Emit to specific user
export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data);
}

// Emit to specific bot subscribers
export function emitToBot(botId: string, event: string, data: unknown): void {
  getIO().to(`bot:${botId}`).emit(event, data);
}

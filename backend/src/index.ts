import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config/index.js';
import { initializeSocket } from './lib/socket.js';
import { BotManager } from './bot/BotManager.js';

// Routes
import authRoutes from './routes/auth.js';
import botsRoutes from './routes/bots.js';
import storageRoutes from './routes/storage.js';
import tasksRoutes from './routes/tasks.js';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bots', botsRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/tasks', tasksRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  
  // Stop accepting new connections and wait for it to close
  await new Promise<void>((resolve) => {
    httpServer.close(() => {
      console.log('HTTP server closed');
      resolve();
    });
  });
  
  await BotManager.getInstance().shutdown();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start server
httpServer.listen(config.port, () => {
  console.log(`🚀 StorageBot API running on http://localhost:${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Frontend URL: ${config.frontendUrl}`);
});

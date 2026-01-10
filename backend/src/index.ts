import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config/index.js';
import { initializeSocket } from './lib/socket.js';
import { BotManager } from './bot/BotManager.js';

// Suppress PartialReadError spam from mineflayer/protodef particle packet parsing
// This is a known issue with Minecraft 1.20.5+ - the errors are harmless but spam the logs
const shouldSuppress = (msg: string) => msg.includes('PartialReadError');

// Intercept stderr.write
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk: any, encoding?: any, callback?: any): boolean => {
  const message = typeof chunk === 'string' ? chunk : chunk.toString();
  if (shouldSuppress(message)) return true;
  return originalStderrWrite(chunk, encoding, callback);
};

// Intercept stdout.write (some errors go here)
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk: any, encoding?: any, callback?: any): boolean => {
  const message = typeof chunk === 'string' ? chunk : chunk.toString();
  if (shouldSuppress(message)) return true;
  return originalStdoutWrite(chunk, encoding, callback);
};

// Intercept console.error
const originalConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  const message = args.map(a => String(a)).join(' ');
  if (shouldSuppress(message)) return;
  originalConsoleError(...args);
};

// Intercept console.log (errors sometimes go here too)
const originalConsoleLog = console.log.bind(console);
console.log = (...args: any[]) => {
  const message = args.map(a => String(a)).join(' ');
  if (shouldSuppress(message)) return;
  originalConsoleLog(...args);
};

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

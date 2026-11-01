import http from 'http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { prisma, checkDatabaseHealth } from './config/prisma.js';
import { initSocketIO } from './socket/index.js';
import { logger } from './middlewares/logger.middleware.js';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO attached to HTTP server
  initSocketIO(server);

  // Verify database connection at startup
  try {
    const dbStatus = await checkDatabaseHealth();
    logger.info(`PostgreSQL connection established (${dbStatus.responseTimeMs}ms) [DB: healthy]`);
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL:', error);
    process.exit(1);
  }

  server.listen(config.port, () => {
    logger.info(`JulleyOnline API server running on port ${config.port} [Mode: ${config.nodeEnv}]`);
    logger.info(`Health check endpoint: http://localhost:${config.port}/api/health`);
    logger.info(`REST API routes: http://localhost:${config.port}/api/v1/*`);
    logger.info(`Socket.IO server: ws://localhost:${config.port}/socket.io/`);
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}. Closing HTTP server and database connection pool...`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Database pool closed. Server terminated cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Fatal startup error during bootstrap:', err);
  process.exit(1);
});

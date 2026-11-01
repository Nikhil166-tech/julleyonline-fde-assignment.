import http from 'http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { prisma, checkDatabaseHealth } from './config/prisma.js';
import { initSocketIO } from './socket/index.js';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO attached to HTTP server
  initSocketIO(server);

  // Verify database connection at startup
  try {
    const dbStatus = await checkDatabaseHealth();
    console.log(`[Database] PostgreSQL connection established (${dbStatus.responseTimeMs}ms)`);
  } catch (error) {
    console.error('[Database] Failed to connect to PostgreSQL:', error.message);
    process.exit(1);
  }

  server.listen(config.port, () => {
    console.log(`[Server] JulleyOnline API server running on port ${config.port} in ${config.nodeEnv} mode`);
    console.log(`[Health] Health endpoint available at http://localhost:${config.port}/api/health`);
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}. Closing HTTP server and database pool...`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[Server] Database pool closed. Server terminated cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});

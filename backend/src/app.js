import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { requestLogger } from './middlewares/logger.middleware.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import orgRoutes from './routes/org.routes.js';
import tenantRoutes from './routes/tenant.routes.js';
import boardRoutes from './routes/board.routes.js';
import columnRoutes from './routes/column.routes.js';
import taskRoutes from './routes/task.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

export function createApp(options = {}) {
  const app = express();

  // Core Middlewares
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Routes
  app.use('/api', healthRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use(['/api/v1/organizations', '/api/v1/orgs'], orgRoutes);
  app.use('/api/v1/tenants', tenantRoutes);
  app.use('/api/v1/boards', boardRoutes);
  app.use('/api/v1/columns', columnRoutes);
  app.use('/api/v1/tasks', taskRoutes);

  // Optional custom test or feature routers (if provided)
  if (options.routes) {
    app.use(options.routes);
  }

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

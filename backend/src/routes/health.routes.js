import { Router } from 'express';
import { checkDatabaseHealth } from '../config/prisma.js';

const router = Router();

router.get('/health', async (req, res, next) => {
  try {
    const dbHealth = await checkDatabaseHealth();

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      services: {
        server: {
          status: 'up',
        },
        database: {
          status: dbHealth.status,
          engine: 'PostgreSQL',
          responseTimeMs: dbHealth.responseTimeMs,
        },
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        server: {
          status: 'up',
        },
        database: {
          status: 'down',
          error: error.message,
        },
      },
    });
  }
});

export default router;

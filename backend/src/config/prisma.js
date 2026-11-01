import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function checkDatabaseHealth() {
  const startTime = Date.now();
  await prisma.$queryRaw`SELECT 1 as health_check`;
  const responseTimeMs = Date.now() - startTime;
  return {
    status: 'connected',
    responseTimeMs,
  };
}

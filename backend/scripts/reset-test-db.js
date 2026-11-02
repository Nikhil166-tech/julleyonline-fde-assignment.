import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import { validateTestDatabaseUrl } from './test-db-guard.js';

export { validateTestDatabaseUrl };

const PROTECTED_BOARD_NAMES = [
  'Sprint 1 - Core Platform MVP',
  'Fleet Dispatch Management',
];

export async function resetTestDatabase(dbUrl = process.env.DATABASE_URL) {
  validateTestDatabaseUrl(dbUrl);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

  try {
    // Find all non-seed boards
    const nonSeedBoards = await prisma.board.findMany({
      where: {
        name: { notIn: PROTECTED_BOARD_NAMES },
      },
      select: { id: true, name: true },
    });

    if (nonSeedBoards.length === 0) {
      console.log('Test database is already in pristine state (2 seeded boards).');
      return { cleaned: 0 };
    }

    const ids = nonSeedBoards.map((b) => b.id);
    await prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { boardId: { in: ids } } });
      await tx.task.deleteMany({ where: { boardId: { in: ids } } });
      await tx.column.deleteMany({ where: { boardId: { in: ids } } });
      await tx.board.deleteMany({ where: { id: { in: ids } } });
    });

    console.log(`Cleaned up ${ids.length} test-generated boards from test database.`);
    return { cleaned: ids.length };
  } finally {
    await prisma.$disconnect();
  }
}

// Only execute when invoked directly from command line
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  resetTestDatabase()
    .catch((e) => {
      console.error('Error resetting test DB:', e.message || e);
      process.exit(1);
    });
}

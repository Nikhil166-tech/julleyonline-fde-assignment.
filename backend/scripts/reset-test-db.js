import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL environment variable is required to run reset-test-db.js.');
}

if (!dbUrl.includes('test') && !dbUrl.includes('julleyonline_kanban_test')) {
  throw new Error(`CRITICAL SAFETY ABORT: reset-test-db.js rejected unexpected target database: ${dbUrl}`);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

const PROTECTED_BOARD_NAMES = [
  'Sprint 1 - Core Platform MVP',
  'Fleet Dispatch Management',
];

async function main() {
  if (!dbUrl.includes('test') && !dbUrl.includes('julleyonline_kanban_test')) {
    throw new Error(`CRITICAL SAFETY ABORT: reset-test-db.js rejected unexpected target database: ${dbUrl}`);
  }

  // Find all non-seed boards
  const nonSeedBoards = await prisma.board.findMany({
    where: {
      name: { notIn: PROTECTED_BOARD_NAMES },
    },
    select: { id: true, name: true },
  });

  if (nonSeedBoards.length === 0) {
    console.log('Test database is already in pristine state (2 seeded boards).');
    return;
  }

  const ids = nonSeedBoards.map((b) => b.id);
  await prisma.$transaction(async (tx) => {
    await tx.activityLog.deleteMany({ where: { boardId: { in: ids } } });
    await tx.task.deleteMany({ where: { boardId: { in: ids } } });
    await tx.column.deleteMany({ where: { boardId: { in: ids } } });
    await tx.board.deleteMany({ where: { id: { in: ids } } });
  });

  console.log(`Cleaned up ${ids.length} test-generated boards from test database.`);
}

main()
  .catch((e) => {
    console.error('Error resetting test DB:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://postgres:postgres@localhost:5433/julleyonline_kanban?schema=public' },
  },
});

async function main() {
  const boards = await prisma.board.findMany({
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, email: true, name: true } },
      _count: { select: { columns: true, tasks: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const baselineSeedBoardIds = new Set([
    // Seed boards from prisma/seed.js
    // We detect by created timestamp or specific known properties
  ]);

  console.log(`\n======================================================`);
  console.log(`DATABASE AUDIT: julleyonline_kanban (${boards.length} Boards)`);
  console.log(`======================================================\n`);

  const categorized = boards.map((b) => {
    const isBaselineSeed =
      (b.name === 'Sprint 1 - Core Platform MVP' && b.tenant.slug === 'engineering') ||
      (b.name === 'Fleet Dispatch Management' && b.tenant.slug === 'operations');

    let origin = 'SEED_BASELINE';
    if (!isBaselineSeed) {
      if (b.name.startsWith('Phase 4 Real-time Board')) {
        origin = 'TEST_PHASE4_SOCKET';
      } else if (b.name.startsWith('E2E Board')) {
        origin = 'TEST_PLAYWRIGHT_E2E';
      } else if (b.name.startsWith('Sprint 24 — Engineering Roadmap')) {
        origin = 'TEST_PLAYWRIGHT_SCREENSHOT';
      } else if (b.name.includes('Sprint 24 Board')) {
        origin = 'TEST_PHASE2B_INTEGRATION';
      } else {
        origin = 'USER_OR_OTHER';
      }
    }

    return {
      id: b.id,
      name: b.name,
      tenant: `${b.tenant.name} (${b.tenant.slug})`,
      tenantId: b.tenant.id,
      creator: `${b.createdBy?.name} (${b.createdBy?.email})`,
      creatorId: b.createdByUserId,
      columnsCount: b._count.columns,
      tasksCount: b._count.tasks,
      createdAt: b.createdAt.toISOString(),
      category: origin,
    };
  });

  console.log(JSON.stringify(categorized, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);

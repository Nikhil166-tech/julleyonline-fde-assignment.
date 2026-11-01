import { PrismaClient } from '@prisma/client';

const targetDbUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/julleyonline_kanban?schema=public';

const prisma = new PrismaClient({
  datasources: {
    db: { url: targetDbUrl },
  },
});

async function main() {
  console.log(`Inspecting database: ${targetDbUrl.split('@')[1]}`);
  const boards = await prisma.board.findMany({
    select: {
      id: true,
      name: true,
      tenantId: true,
      createdByUserId: true,
      createdAt: true,
      tenant: { select: { name: true, slug: true } },
      createdBy: { select: { email: true, name: true } },
      _count: { select: { columns: true, tasks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total boards in DB: ${boards.length}`);
  const dbs = await prisma.$queryRawUnsafe('SELECT datname FROM pg_database WHERE datistemplate = false;');
  console.log('PostgreSQL databases:', dbs);
  console.table(
    boards.map((b) => ({
      id: b.id.slice(0, 8),
      name: b.name.slice(0, 35),
      tenant: b.tenant.slug,
      creator: b.createdBy?.email || 'N/A',
      columns: b._count.columns,
      tasks: b._count.tasks,
      created: b.createdAt.toISOString().slice(11, 19),
    }))
  );
  await prisma.$disconnect();
}

main().catch(console.error);

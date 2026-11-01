import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

// Protected Seed IDs that must NEVER be deleted
const PROTECTED_BOARD_IDS = new Set([
  '925b7c50-2c7b-4550-af42-da6f06b9b617', // Sprint 1 - Core Platform MVP (Acme Engineering)
  '0f9ccf03-9501-4556-9ea4-a38ad857d806', // Fleet Dispatch Management (Nexus Operations)
]);

async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    throw new Error(`CRITICAL SAFETY ABORT: cleanup-test-boards.js rejected non-local/unexpected target database: ${dbUrl}`);
  }

  const isConfirmed = process.argv.includes('--confirm');

  console.log('======================================================');
  console.log(`TEST DATA CLEANUP AUDIT (${isConfirmed ? 'EXECUTION MODE' : 'DRY RUN'})`);
  console.log('Database URL:', process.env.DATABASE_URL);
  console.log('======================================================\n');

  const allBoards = await prisma.board.findMany({
    include: {
      columns: {
        include: {
          tasks: true,
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const testBoards = allBoards.filter((b) => {
    if (PROTECTED_BOARD_IDS.has(b.id)) return false;
    // Test boards created during development test runs
    const isTestNamed =
      b.name.includes('Sprint 24') ||
      b.name.includes('E2E Board') ||
      b.name.includes('Phase 4 Real-time Board') ||
      b.name.includes('Beta Release Board') ||
      b.name.includes('Sprint Planning') ||
      b.name.includes('Other Project Board');
    return isTestNamed;
  });

  console.log(`Total boards found: ${allBoards.length}`);
  console.log(`Protected baseline seed boards: ${allBoards.length - testBoards.length}`);
  console.log(`Test-generated boards identified for cleanup: ${testBoards.length}\n`);

  if (testBoards.length === 0) {
    console.log('No test boards found to clean up.');
    return;
  }

  console.log('Identified Test Boards:');
  testBoards.forEach((b, idx) => {
    const totalTasks = b.columns.reduce((sum, col) => sum + col.tasks.length, 0);
    console.log(
      `  [${idx + 1}] ID: ${b.id} | Name: "${b.name}" | Tenant: ${b.tenant.name} | Tasks: ${totalTasks} | Created: ${b.createdAt.toISOString()}`
    );
  });

  if (!isConfirmed) {
    console.log('\n------------------------------------------------------');
    console.log('SAFETY NOTICE: DRY RUN ONLY.');
    console.log('No records were deleted from the database.');
    console.log('To execute this cleanup after explicit user confirmation, run:');
    console.log('  node backend/scripts/cleanup-test-boards.js --confirm');
    console.log('------------------------------------------------------');
    return;
  }

  console.log('\nExecuting transactional cleanup of test boards...');

  let deletedBoards = 0;
  for (const b of testBoards) {
    await prisma.$transaction(async (tx) => {
      // 1. Delete activity logs
      await tx.activityLog.deleteMany({ where: { boardId: b.id } });
      // 2. Delete tasks
      await tx.task.deleteMany({ where: { boardId: b.id } });
      // 3. Delete columns
      await tx.column.deleteMany({ where: { boardId: b.id } });
      // 4. Delete board
      await tx.board.delete({ where: { id: b.id } });
    });
    deletedBoards++;
  }

  console.log(`\nSuccessfully deleted ${deletedBoards} test boards and their related records.`);
  console.log('Database returned to clean state with only protected seed boards remaining.');
}

main()
  .catch((err) => {
    console.error('Cleanup script error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

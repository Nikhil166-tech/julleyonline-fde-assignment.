import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const devPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:postgres@localhost:5433/julleyonline_kanban?schema=public',
    },
  },
});

async function main() {
  console.log('Checking if julleyonline_kanban_test exists...');
  const res = await devPrisma.$queryRawUnsafe(
    "SELECT 1 FROM pg_database WHERE datname = 'julleyonline_kanban_test';"
  );

  if (res.length === 0) {
    console.log('Creating database julleyonline_kanban_test...');
    await devPrisma.$executeRawUnsafe('CREATE DATABASE julleyonline_kanban_test;');
    console.log('Created julleyonline_kanban_test.');
  } else {
    console.log('Database julleyonline_kanban_test already exists.');
  }

  await devPrisma.$disconnect();

  const testDbUrl = 'postgresql://postgres:postgres@localhost:5433/julleyonline_kanban_test?schema=public';
  console.log('Running Prisma migrations on test database...');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  console.log('Seeding baseline data on test database...');
  execSync('node prisma/seed.js', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  console.log('Test database setup and seeding complete!');
}

main().catch((err) => {
  console.error('Test DB setup failed:', err);
  process.exit(1);
});

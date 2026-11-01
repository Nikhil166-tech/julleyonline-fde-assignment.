import { PrismaClient, Role, Priority } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting database seed...');

  // Clean existing data in reverse dependency order
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.column.deleteMany();
  await prisma.board.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Users
  console.log('[Seed] Creating test users...');
  const alice = await prisma.user.create({
    data: {
      email: 'alice@acme.com',
      passwordHash,
      name: 'Alice Vance',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@acme.com',
      passwordHash,
      name: 'Bob Smith',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
    },
  });

  const charlie = await prisma.user.create({
    data: {
      email: 'charlie@acme.com',
      passwordHash,
      name: 'Charlie Chen',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
    },
  });

  const diana = await prisma.user.create({
    data: {
      email: 'diana@nexus.com',
      passwordHash,
      name: 'Diana Prince',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana',
    },
  });

  const edward = await prisma.user.create({
    data: {
      email: 'edward@nexus.com',
      passwordHash,
      name: 'Edward Norton',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Edward',
    },
  });

  const fiona = await prisma.user.create({
    data: {
      email: 'fiona@nexus.com',
      passwordHash,
      name: 'Fiona Gallagher',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fiona',
    },
  });

  // 2. Organization 1: Acme Technologies
  console.log('[Seed] Creating Organization 1: Acme Technologies...');
  const acmeOrg = await prisma.organization.create({
    data: {
      name: 'Acme Technologies',
      slug: 'acme-tech',
    },
  });

  const acmeEngTenant = await prisma.tenant.create({
    data: {
      orgId: acmeOrg.id,
      name: 'Engineering & Product',
      slug: 'engineering',
    },
  });

  const acmeMktgTenant = await prisma.tenant.create({
    data: {
      orgId: acmeOrg.id,
      name: 'Marketing & Growth',
      slug: 'marketing',
    },
  });

  // Memberships for Acme:
  // Alice: Org Admin (org-level)
  await prisma.membership.create({
    data: {
      userId: alice.id,
      orgId: acmeOrg.id,
      tenantId: null, // Org-level scope
      role: Role.ORG_ADMIN,
    },
  });

  // Bob: Tenant Admin in Engineering, Member in Marketing
  await prisma.membership.create({
    data: {
      userId: bob.id,
      orgId: acmeOrg.id,
      tenantId: acmeEngTenant.id,
      role: Role.TENANT_ADMIN,
    },
  });
  await prisma.membership.create({
    data: {
      userId: bob.id,
      orgId: acmeOrg.id,
      tenantId: acmeMktgTenant.id,
      role: Role.MEMBER,
    },
  });

  // Charlie: Member in Engineering
  await prisma.membership.create({
    data: {
      userId: charlie.id,
      orgId: acmeOrg.id,
      tenantId: acmeEngTenant.id,
      role: Role.MEMBER,
    },
  });

  // 3. Organization 2: Nexus Global Enterprise
  console.log('[Seed] Creating Organization 2: Nexus Global Enterprise...');
  const nexusOrg = await prisma.organization.create({
    data: {
      name: 'Nexus Global Enterprise',
      slug: 'nexus-global',
    },
  });

  const nexusOpsTenant = await prisma.tenant.create({
    data: {
      orgId: nexusOrg.id,
      name: 'Operations & Fleet',
      slug: 'operations',
    },
  });

  const nexusCsTenant = await prisma.tenant.create({
    data: {
      orgId: nexusOrg.id,
      name: 'Customer Success',
      slug: 'customer-success',
    },
  });

  // Memberships for Nexus:
  // Diana: Org Admin (org-level)
  await prisma.membership.create({
    data: {
      userId: diana.id,
      orgId: nexusOrg.id,
      tenantId: null,
      role: Role.ORG_ADMIN,
    },
  });

  // Edward: Tenant Admin in Operations
  await prisma.membership.create({
    data: {
      userId: edward.id,
      orgId: nexusOrg.id,
      tenantId: nexusOpsTenant.id,
      role: Role.TENANT_ADMIN,
    },
  });

  // Fiona: Member in Operations
  await prisma.membership.create({
    data: {
      userId: fiona.id,
      orgId: nexusOrg.id,
      tenantId: nexusOpsTenant.id,
      role: Role.MEMBER,
    },
  });

  // 4. Boards, Columns & Tasks for Acme Engineering
  console.log('[Seed] Creating Boards, Columns, and Tasks for Acme Engineering...');
  const sprintBoard = await prisma.board.create({
    data: {
      tenantId: acmeEngTenant.id,
      name: 'Sprint 1 - Core Platform MVP',
      description: 'Q4 Core Platform Deliverables and Sprint Goals',
      createdByUserId: bob.id,
    },
  });

  const colBacklog = await prisma.column.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      name: 'Backlog',
      position: 0,
    },
  });

  const colInProgress = await prisma.column.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      name: 'In Progress',
      position: 1,
    },
  });

  const colReview = await prisma.column.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      name: 'Review',
      position: 2,
    },
  });

  const colDone = await prisma.column.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      name: 'Done',
      position: 3,
    },
  });

  // Tasks in Backlog
  const task1 = await prisma.task.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      columnId: colBacklog.id,
      createdByUserId: bob.id,
      assignedToUserId: charlie.id,
      title: 'Set up Prisma schema & migrations',
      description: 'Define models for all 8 entities with proper constraints and indexes.',
      position: 0,
      priority: Priority.HIGH,
      version: 1,
    },
  });

  // Tasks in In Progress
  const task2 = await prisma.task.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      columnId: colInProgress.id,
      createdByUserId: bob.id,
      assignedToUserId: bob.id,
      title: 'Configure Socket.IO room security',
      description: 'Ensure clients can only join rooms matching their authorized tenant and board.',
      position: 0,
      priority: Priority.URGENT,
      version: 1,
    },
  });

  // Tasks in Review
  const task3 = await prisma.task.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      columnId: colReview.id,
      createdByUserId: alice.id,
      assignedToUserId: charlie.id,
      title: 'Implement JWT auth & tenant context middleware',
      description: 'Validate Bearer tokens and verify tenant membership from X-Tenant-ID header.',
      position: 0,
      priority: Priority.MEDIUM,
      version: 1,
    },
  });

  // Tasks in Done
  const task4 = await prisma.task.create({
    data: {
      tenantId: acmeEngTenant.id,
      boardId: sprintBoard.id,
      columnId: colDone.id,
      createdByUserId: alice.id,
      assignedToUserId: bob.id,
      title: 'Design system architecture specs',
      description: 'Complete architecture.md, database-design.md and development roadmap.',
      position: 0,
      priority: Priority.LOW,
      version: 1,
    },
  });

  // 5. Activity Logs
  console.log('[Seed] Recording activity logs...');
  await prisma.activityLog.createMany({
    data: [
      {
        tenantId: acmeEngTenant.id,
        boardId: sprintBoard.id,
        taskId: null,
        userId: bob.id,
        action: 'BOARD_CREATED',
        details: { boardName: sprintBoard.name },
      },
      {
        tenantId: acmeEngTenant.id,
        boardId: sprintBoard.id,
        taskId: task1.id,
        userId: bob.id,
        action: 'TASK_CREATED',
        details: { taskTitle: task1.title, column: 'Backlog' },
      },
      {
        tenantId: acmeEngTenant.id,
        boardId: sprintBoard.id,
        taskId: task2.id,
        userId: bob.id,
        action: 'TASK_MOVED',
        details: { taskTitle: task2.title, from: 'Backlog', to: 'In Progress' },
      },
    ],
  });

  // 6. Board for Nexus Operations
  console.log('[Seed] Creating Board for Nexus Operations...');
  const nexusBoard = await prisma.board.create({
    data: {
      tenantId: nexusOpsTenant.id,
      name: 'Fleet Dispatch Management',
      description: 'Live delivery and maintenance tracking',
      createdByUserId: edward.id,
    },
  });

  const nexusColDispatch = await prisma.column.create({
    data: {
      tenantId: nexusOpsTenant.id,
      boardId: nexusBoard.id,
      name: 'Dispatched',
      position: 0,
    },
  });

  await prisma.task.create({
    data: {
      tenantId: nexusOpsTenant.id,
      boardId: nexusBoard.id,
      columnId: nexusColDispatch.id,
      createdByUserId: edward.id,
      assignedToUserId: fiona.id,
      title: 'Inspect Delivery Van #402',
      description: 'Routine safety inspection and brake pads renewal',
      position: 0,
      priority: Priority.HIGH,
      version: 1,
    },
  });

  console.log('[Seed] Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('[Seed] Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

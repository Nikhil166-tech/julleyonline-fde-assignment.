import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

describe('Phase 2B: Complete Board, Column and Task Backend APIs Test Suite', () => {
  let server;
  let baseUrl;

  // Cached entities
  let acmeOrg;
  let acmeEngTenant;
  let acmeMktgTenant;
  let nexusOrg;
  let nexusOpsTenant;
  let aliceToken; // Org Admin (Acme)
  let bobToken;   // Tenant Admin (Engineering), Member (Marketing)
  let charlieToken; // Member (Engineering)
  let dianaToken; // Org Admin (Nexus)
  let aliceUser;
  let bobUser;
  let charlieUser;
  let dianaUser;

  // Reusable board/column/task IDs created during tests
  let testBoardId;
  let backlogColId;
  let inProgressColId;
  let doneColId;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    acmeOrg = await prisma.organization.findUnique({ where: { slug: 'acme-tech' } });
    acmeEngTenant = await prisma.tenant.findFirst({
      where: { orgId: acmeOrg.id, slug: 'engineering' },
    });
    acmeMktgTenant = await prisma.tenant.findFirst({
      where: { orgId: acmeOrg.id, slug: 'marketing' },
    });
    nexusOrg = await prisma.organization.findUnique({ where: { slug: 'nexus-global' } });
    nexusOpsTenant = await prisma.tenant.findFirst({
      where: { orgId: nexusOrg.id, slug: 'operations' },
    });

    aliceUser = await prisma.user.findUnique({ where: { email: 'alice@acme.com' } });
    bobUser = await prisma.user.findUnique({ where: { email: 'bob@acme.com' } });
    charlieUser = await prisma.user.findUnique({ where: { email: 'charlie@acme.com' } });
    dianaUser = await prisma.user.findUnique({ where: { email: 'diana@nexus.com' } });

    const loginUser = async (email, password = 'password123') => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      return data.data.token;
    };

    aliceToken = await loginUser('alice@acme.com');
    bobToken = await loginUser('bob@acme.com');
    charlieToken = await loginUser('charlie@acme.com');
    dianaToken = await loginUser('diana@nexus.com');
  });

  after(async () => {
    if (testBoardId) {
      try {
        await prisma.activityLog.deleteMany({ where: { boardId: testBoardId } });
        await prisma.task.deleteMany({ where: { boardId: testBoardId } });
        await prisma.column.deleteMany({ where: { boardId: testBoardId } });
        await prisma.board.delete({ where: { id: testBoardId } });
      } catch (e) {
        // Ignore if already deleted
      }
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  // =============================================================
  // Test Group 1: Board CRUD, Isolation & Activity Feed
  // =============================================================
  describe('Board CRUD, Permissions & Activity Logs', () => {
    it('TC-BRD-01: Bob (Tenant Admin) creates a board with default workflow columns', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          name: 'Sprint 24 Board',
          description: 'Core Engineering Sprint Board',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.name, 'Sprint 24 Board');
      assert.equal(data.data.tenantId, acmeEngTenant.id);
      testBoardId = data.data.id;

      // Verify default columns were created in DB
      const columns = await prisma.column.findMany({
        where: { boardId: testBoardId, tenantId: acmeEngTenant.id },
        orderBy: { position: 'asc' },
      });
      assert.equal(columns.length, 3);
      assert.equal(columns[0].name, 'Backlog');
      assert.equal(columns[0].position, 0);
      assert.equal(columns[1].name, 'In Progress');
      assert.equal(columns[1].position, 1);
      assert.equal(columns[2].name, 'Done');
      assert.equal(columns[2].position, 2);

      backlogColId = columns[0].id;
      inProgressColId = columns[1].id;
      doneColId = columns[2].id;
    });

    it('TC-BRD-02: Charlie (Member) creating a board is rejected with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          name: 'Unauthorized Member Board',
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'FORBIDDEN');
    });

    it('TC-BRD-03: List boards returns boards scoped to the active tenant workspace', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards`, {
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.some((b) => b.id === testBoardId));
    });

    it('TC-BRD-04: Cross-tenant board access attempt is rejected with HTTP 403 Forbidden', async () => {
      // Diana (Nexus) attempts to access Acme Engineering board using her Nexus tenant context
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}`, {
        headers: {
          Authorization: `Bearer ${dianaToken}`,
          'X-Tenant-ID': nexusOpsTenant.id,
        },
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'FORBIDDEN');
    });

    it('TC-BRD-05: GET board snapshot returns ordered columns and nested tasks', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}`, {
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.id, testBoardId);
      assert.equal(data.data.columns.length, 3);
      assert.equal(data.data.columns[0].name, 'Backlog');
    });

    it('TC-BRD-06: Bob (Tenant Admin) updates board name and description', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          name: 'Sprint 24 Board (Updated)',
          description: 'Updated sprint description',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.name, 'Sprint 24 Board (Updated)');
    });

    it('TC-BRD-07: GET activities returns chronological log of board events', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/activities`, {
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.some((a) => a.action === 'BOARD_CREATED'));
      assert.ok(data.data.some((a) => a.action === 'BOARD_UPDATED'));
    });
  });

  // =============================================================
  // Test Group 2: Column Management & Non-Empty Policy
  // =============================================================
  describe('Column Management & Non-Empty Policy', () => {
    let newColId;

    it('TC-COL-01: Bob (Tenant Admin) adds a new column with contiguous position', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/columns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          name: 'Code Review',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.name, 'Code Review');
      assert.equal(data.data.position, 3);
      newColId = data.data.id;
    });

    it('TC-COL-02: Charlie (Member) adding a column is rejected with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/columns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          name: 'Member Column',
        }),
      });

      assert.equal(res.status, 403);
    });

    it('TC-COL-03: Bob renames column', async () => {
      const res = await fetch(`${baseUrl}/api/v1/columns/${newColId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          name: 'QA & Review',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.name, 'QA & Review');
    });

    it('TC-COL-04: Non-empty column deletion policy: rejects deleting column containing tasks with HTTP 400', async () => {
      // 1. Create a task in newColId
      const taskRes = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: newColId,
          title: 'Review PR #42',
        }),
      });
      assert.equal(taskRes.status, 201);
      const taskData = await taskRes.json();
      const blockerTaskId = taskData.data.id;

      // 2. Attempt to delete non-empty column
      const delRes = await fetch(`${baseUrl}/api/v1/columns/${newColId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(delRes.status, 400);
      const delData = await delRes.json();
      assert.equal(delData.success, false);
      assert.match(delData.error.message, /Cannot delete column containing 1 task/);

      // Clean up blocker task
      await prisma.task.delete({ where: { id: blockerTaskId } });
    });

    it('TC-COL-05: Deletes empty column and shifts subsequent column positions', async () => {
      const delRes = await fetch(`${baseUrl}/api/v1/columns/${newColId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(delRes.status, 200);
      const data = await delRes.json();
      assert.equal(data.success, true);

      // Verify column count is back to 3
      const count = await prisma.column.count({ where: { boardId: testBoardId } });
      assert.equal(count, 3);
    });
  });

  // =============================================================
  // Test Group 3: Task CRUD, Assignment & Boundary Rules
  // =============================================================
  describe('Task CRUD, Assignment & Boundary Rules', () => {
    let createdTaskId;

    it('TC-TSK-01: Charlie (Member) creates task with initial version 1 and contiguous position 0', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          title: 'Implement Authentication Middleware',
          description: 'Verify JWT and tenant context headers',
          priority: 'HIGH',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.title, 'Implement Authentication Middleware');
      assert.equal(data.data.version, 1);
      assert.equal(data.data.position, 0);
      assert.equal(data.data.createdByUserId, charlieUser.id);
      createdTaskId = data.data.id;
    });

    it('TC-TSK-02: Rejects assigning task to user outside tenant with HTTP 400 Validation Error', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          title: 'Cross Tenant Assignment Test',
          assignedToUserId: dianaUser.id, // Diana belongs to Nexus, not Acme
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.error.message, /Assignee does not belong to this tenant workspace/);
    });

    it('TC-TSK-03: Successfully assigns task to member in tenant', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks/${createdTaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          assignedToUserId: bobUser.id,
          version: 1,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.assignedToUserId, bobUser.id);
      assert.equal(data.data.version, 2); // Version incremented to 2
    });

    it('TC-TSK-04: Cross-tenant task retrieval is rejected with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks/${createdTaskId}`, {
        headers: {
          Authorization: `Bearer ${dianaToken}`,
          'X-Tenant-ID': nexusOpsTenant.id,
        },
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'FORBIDDEN');
    });

    it('TC-TSK-05: Rejects moving task to column on a different board with HTTP 400', async () => {
      // 1. Alice creates a separate board in Acme Engineering
      const otherBoardRes = await fetch(`${baseUrl}/api/v1/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ name: 'Other Project Board' }),
      });
      const otherBoardData = await otherBoardRes.json();
      const otherBoard = await prisma.board.findUnique({
        where: { id: otherBoardData.data.id },
        include: { columns: true },
      });
      const otherColId = otherBoard.columns[0].id;

      // 2. Attempt to move createdTaskId to otherColId
      const moveRes = await fetch(`${baseUrl}/api/v1/tasks/${createdTaskId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          targetColumnId: otherColId,
          newPosition: 0,
          version: 2,
        }),
      });

      assert.equal(moveRes.status, 400);
      const moveData = await moveRes.json();
      assert.equal(moveData.success, false);
      assert.match(moveData.error.message, /Cannot move task to a column on a different board/);

      // Clean up other board
      await prisma.board.delete({ where: { id: otherBoard.id } });
    });

    it('TC-TSK-06: Task deletion RBAC: Member cannot delete task created by another; creator or admin can', async () => {
      // 1. Bob creates a task
      const bobsTaskRes = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          title: "Bob's Secret Task",
        }),
      });
      const bobsTaskData = await bobsTaskRes.json();
      const bobsTaskId = bobsTaskData.data.id;

      // 2. Charlie (Member) attempts to delete Bob's task -> 403 Forbidden
      const charlieDelRes = await fetch(`${baseUrl}/api/v1/tasks/${bobsTaskId}?version=1`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(charlieDelRes.status, 403);

      // 3. Charlie deletes his own task (createdTaskId, now at version 2) -> 200 OK
      const ownDelRes = await fetch(`${baseUrl}/api/v1/tasks/${createdTaskId}?version=2`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(ownDelRes.status, 200);

      // 4. Bob (Tenant Admin) deletes his task -> 200 OK
      const adminDelRes = await fetch(`${baseUrl}/api/v1/tasks/${bobsTaskId}?version=1`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(adminDelRes.status, 200);
    });
  });

  // =============================================================
  // Test Group 4: Optimistic Concurrency Control (OCC) & Conflict Resolution
  // =============================================================
  describe('Optimistic Concurrency Control (OCC) & Conflict Handling', () => {
    let occTaskId;

    it('TC-OCC-01: Concurrent task edit returns HTTP 409 Conflict with currentTask for stale update', async () => {
      // 1. Create a fresh task at version 1
      const taskRes = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          title: 'Concurrent Task Spec',
          description: 'Original text version 1',
        }),
      });
      const taskData = await taskRes.json();
      occTaskId = taskData.data.id;
      assert.equal(taskData.data.version, 1);

      // 2. Client A (Charlie) updates task from v1 to v2 -> Succeeds
      const clientARes = await fetch(`${baseUrl}/api/v1/tasks/${occTaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          title: 'Concurrent Task Spec (Client A Updated)',
          version: 1,
        }),
      });
      assert.equal(clientARes.status, 200);
      const clientAData = await clientARes.json();
      assert.equal(clientAData.data.version, 2);
      assert.equal(clientAData.data.title, 'Concurrent Task Spec (Client A Updated)');

      // 3. Client B (Bob) submits update using stale version 1 -> HTTP 409 Conflict
      const clientBRes = await fetch(`${baseUrl}/api/v1/tasks/${occTaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          description: 'Client B overwrite attempt with stale version 1',
          version: 1, // Stale!
        }),
      });

      assert.equal(clientBRes.status, 409);
      const clientBData = await clientBRes.json();
      assert.equal(clientBData.success, false);
      assert.equal(clientBData.error.code, 'CONFLICT');
      assert.ok(clientBData.error.details?.currentTask);
      assert.equal(clientBData.error.details.currentTask.version, 2);
      assert.equal(clientBData.error.details.currentTask.title, 'Concurrent Task Spec (Client A Updated)');

      // 4. Client B refreshes to authoritative version 2 and re-applies -> Succeeds with v3
      const refreshedVersion = clientBData.error.details.currentTask.version;
      const clientBRetry = await fetch(`${baseUrl}/api/v1/tasks/${occTaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          description: 'Client B refreshed and re-applied',
          version: refreshedVersion,
        }),
      });

      assert.equal(clientBRetry.status, 200);
      const clientBRetryData = await clientBRetry.json();
      assert.equal(clientBRetryData.data.version, 3);
      assert.equal(clientBRetryData.data.description, 'Client B refreshed and re-applied');
    });

    it('TC-OCC-02: Simultaneous task move and edit: move succeeds with v3 -> v4, stale edit fails with 409', async () => {
      // 1. Move task from Backlog to In Progress using version 3 -> Succeeds (v4)
      const moveRes = await fetch(`${baseUrl}/api/v1/tasks/${occTaskId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          targetColumnId: inProgressColId,
          newPosition: 0,
          version: 3,
        }),
      });

      assert.equal(moveRes.status, 200);
      const moveData = await moveRes.json();
      assert.equal(moveData.data.version, 4);
      assert.equal(moveData.data.columnId, inProgressColId);

      // 2. Simultaneous edit with stale version 3 -> HTTP 409 Conflict
      const staleEditRes = await fetch(`${baseUrl}/api/v1/tasks/${occTaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          title: 'Simultaneous Title Edit',
          version: 3, // Stale!
        }),
      });

      assert.equal(staleEditRes.status, 409);
      const staleEditData = await staleEditRes.json();
      assert.equal(staleEditData.error.code, 'CONFLICT');
      assert.equal(staleEditData.error.details.currentTask.version, 4);
      assert.equal(staleEditData.error.details.currentTask.columnId, inProgressColId);
    });

    it('TC-OCC-03: Reordering within same column shifts sibling positions cleanly', async () => {
      // Create 3 tasks in Done column
      const createInDone = async (title) => {
        const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bobToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
          body: JSON.stringify({ columnId: doneColId, title }),
        });
        const d = await res.json();
        return d.data;
      };

      const t0 = await createInDone('Done Item 0');
      const t1 = await createInDone('Done Item 1');
      const t2 = await createInDone('Done Item 2');

      assert.equal(t0.position, 0);
      assert.equal(t1.position, 1);
      assert.equal(t2.position, 2);

      // Move t2 (pos 2) to pos 0
      const moveRes = await fetch(`${baseUrl}/api/v1/tasks/${t2.id}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          targetColumnId: doneColId,
          newPosition: 0,
          version: t2.version,
        }),
      });

      assert.equal(moveRes.status, 200);
      const moved = (await moveRes.json()).data;
      assert.equal(moved.position, 0);

      // Fetch all tasks in Done column and verify order: t2 (pos 0), t0 (pos 1), t1 (pos 2)
      const tasksInDone = await prisma.task.findMany({
        where: { columnId: doneColId },
        orderBy: { position: 'asc' },
      });

      assert.equal(tasksInDone[0].id, t2.id);
      assert.equal(tasksInDone[0].position, 0);
      assert.equal(tasksInDone[1].id, t0.id);
      assert.equal(tasksInDone[1].position, 1);
      assert.equal(tasksInDone[2].id, t1.id);
      assert.equal(tasksInDone[2].position, 2);
    });

    it('TC-OCC-04: Moving task across columns closes source gap and opens target gap', async () => {
      // Current in Done: [t2 (0), t0 (1), t1 (2)]
      const tasksBefore = await prisma.task.findMany({
        where: { columnId: doneColId },
        orderBy: { position: 'asc' },
      });
      const t0 = tasksBefore[1]; // Pos 1

      // Move t0 from Done to Backlog at pos 0
      const moveCrossRes = await fetch(`${baseUrl}/api/v1/tasks/${t0.id}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          targetColumnId: backlogColId,
          newPosition: 0,
          version: t0.version,
        }),
      });

      assert.equal(moveCrossRes.status, 200);

      // Verify Done column has contiguous 0, 1 (source gap closed)
      const tasksInDoneAfter = await prisma.task.findMany({
        where: { columnId: doneColId },
        orderBy: { position: 'asc' },
      });
      assert.equal(tasksInDoneAfter.length, 2);
      assert.equal(tasksInDoneAfter[0].position, 0);
      assert.equal(tasksInDoneAfter[1].position, 1);

      // Verify Backlog column has t0 at pos 0 and other tasks shifted down
      const tasksInBacklog = await prisma.task.findMany({
        where: { columnId: backlogColId },
        orderBy: { position: 'asc' },
      });
      assert.equal(tasksInBacklog[0].id, t0.id);
      assert.equal(tasksInBacklog[0].position, 0);
    });

    it('TC-OCC-05: Concurrent race condition: two simultaneous requests at same version yield 1 success and 1 HTTP 409', async () => {
      // 1. Create a fresh task
      const taskRes = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          title: 'Race Condition Task',
        }),
      });
      const taskData = await taskRes.json();
      const raceTaskId = taskData.data.id;
      const initialVersion = taskData.data.version;

      // 2. Fire two simultaneous updates with the exact same initial version
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/v1/tasks/${raceTaskId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
          body: JSON.stringify({
            title: 'Alice simultaneous edit',
            version: initialVersion,
          }),
        }),
        fetch(`${baseUrl}/api/v1/tasks/${raceTaskId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bobToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
          body: JSON.stringify({
            title: 'Bob simultaneous edit',
            version: initialVersion,
          }),
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (200) and one must receive conflict (409)
      assert.deepEqual(statuses, [200, 409]);
    });

    it('TC-OCC-06: Task deletion with stale version returns HTTP 409 Conflict, latest task state, and preserves task', async () => {
      // 1. Create task at v1
      const taskRes = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          title: 'Delete OCC Task',
        }),
      });
      assert.equal(taskRes.status, 201);
      const { data: createdTask } = await taskRes.json();
      assert.equal(createdTask.version, 1);

      // 2. Bob edits task producing version 2
      const updateRes = await fetch(`${baseUrl}/api/v1/tasks/${createdTask.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          title: 'Bob Updated Delete OCC Task',
          version: 1,
        }),
      });
      assert.equal(updateRes.status, 200);
      const { data: updatedTask } = await updateRes.json();
      assert.equal(updatedTask.version, 2);

      // 3. Alice attempts deletion using stale version 1
      const staleDeleteRes = await fetch(`${baseUrl}/api/v1/tasks/${createdTask.id}?version=1`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(staleDeleteRes.status, 409);
      const conflictData = await staleDeleteRes.json();
      assert.equal(conflictData.success, false);
      assert.equal(conflictData.error.code, 'CONFLICT');
      assert.match(conflictData.error.message, /modified by another collaborator/i);
      assert.equal(conflictData.error.details.currentTask.version, 2);

      // 4. Verify task still exists in PostgreSQL with Bob's changes intact
      const dbTask = await prisma.task.findUnique({ where: { id: createdTask.id } });
      assert.ok(dbTask, 'Task must NOT be deleted after a 409 conflict');
      assert.equal(dbTask.title, 'Bob Updated Delete OCC Task');
      assert.equal(dbTask.version, 2);
    });

    it('TC-OCC-07: Task deletion with missing version returns HTTP 400 Validation Error', async () => {
      const taskRes = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          title: 'Missing Version Delete Task',
        }),
      });
      const { data: task } = await taskRes.json();

      const noVerRes = await fetch(`${baseUrl}/api/v1/tasks/${task.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(noVerRes.status, 400);
      const errData = await noVerRes.json();
      assert.equal(errData.success, false);
      assert.equal(errData.error.code, 'VALIDATION_ERROR');
    });

    it('TC-OCC-08: Task deletion using authoritative version succeeds and maintains contiguous column ordering', async () => {
      // 1. Create two consecutive tasks
      const res1 = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ columnId: backlogColId, title: 'Contiguous A' }),
      });
      const { data: tA } = await res1.json();

      const res2 = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ columnId: backlogColId, title: 'Contiguous B' }),
      });
      const { data: tB } = await res2.json();

      // Delete task A using authoritative version
      const delRes = await fetch(`${baseUrl}/api/v1/tasks/${tA.id}?version=${tA.version}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(delRes.status, 200);

      // Verify task B shifted position to fill gap
      const remainingTasks = await prisma.task.findMany({
        where: { columnId: backlogColId },
        orderBy: { position: 'asc' },
      });
      const posB = remainingTasks.find((t) => t.id === tB.id);
      assert.ok(posB);
      assert.equal(posB.position, tA.position);
    });

    it('TC-OCC-09: Concurrent edit versus deletion race resolves atomically without corruption', async () => {
      // 1. Create task at v1
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ columnId: backlogColId, title: 'Edit vs Delete Race' }),
      });
      const { data: task } = await res.json();
      assert.equal(task.version, 1);

      // 2. Fire simultaneous edit (v1 -> v2) and deletion (at v1)
      const [editRes, delRes] = await Promise.all([
        fetch(`${baseUrl}/api/v1/tasks/${task.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bobToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
          body: JSON.stringify({ title: 'Simultaneous Edit Winner', version: 1 }),
        }),
        fetch(`${baseUrl}/api/v1/tasks/${task.id}?version=1`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
        }),
      ]);

      const statuses = [editRes.status, delRes.status].sort();
      // One operation must succeed with 200, the other must fail safely (409 or 404)
      assert.ok(statuses.includes(200), 'At least one operation must succeed with 200');
      assert.ok(statuses.includes(409) || statuses.includes(404), 'Losing operation must receive 409 Conflict or 404 Not Found');

      if (editRes.status === 200) {
        assert.equal(delRes.status, 409);
        const conflictData = await delRes.json();
        assert.equal(conflictData.error.code, 'CONFLICT');
        assert.equal(conflictData.error.details.currentTask.version, 2);
      }
    });

    it('TC-OCC-10: Concurrent task move versus deletion race resolves safely under column lock', async () => {
      // 1. Create task at v1
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ columnId: backlogColId, title: 'Move vs Delete Race' }),
      });
      const { data: task } = await res.json();

      // 2. Fire simultaneous move (to inProgress) and deletion (at v1)
      const [moveRes, delRes] = await Promise.all([
        fetch(`${baseUrl}/api/v1/tasks/${task.id}/move`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bobToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
          body: JSON.stringify({ targetColumnId: inProgressColId, newPosition: 0, version: 1 }),
        }),
        fetch(`${baseUrl}/api/v1/tasks/${task.id}?version=1`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
        }),
      ]);

      const statuses = [moveRes.status, delRes.status].sort();
      assert.ok(statuses.includes(200));
      assert.ok(statuses.includes(409) || statuses.includes(404));
    });

    it('TC-OCC-11: Concurrent double deletion of the same task yields exactly 1 success and 1 HTTP 404', async () => {
      // 1. Create task at v1
      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ columnId: backlogColId, title: 'Double Delete Race' }),
      });
      const { data: task } = await res.json();

      // 2. Fire simultaneous deletions with version 1
      const [delRes1, delRes2] = await Promise.all([
        fetch(`${baseUrl}/api/v1/tasks/${task.id}?version=1`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
        }),
        fetch(`${baseUrl}/api/v1/tasks/${task.id}?version=1`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${bobToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
        }),
      ]);

      const statuses = [delRes1.status, delRes2.status].sort();
      // Exactly one succeeds with 200, second receives 404 Not Found (already deleted)
      assert.deepEqual(statuses, [200, 404]);

      // Confirm task no longer exists
      const dbTask = await prisma.task.findUnique({ where: { id: task.id } });
      assert.equal(dbTask, null);
    });
  });

  // =============================================================
  // Test Group 5: Edge Cases, Transaction Rollback & Dynamic RBAC
  // =============================================================
  describe('Edge Cases, Validation, Transaction Rollback & Dynamic RBAC', () => {
    it('TC-EDG-01: Invalid UUID path parameters return HTTP 400 Validation Error', async () => {
      const res = await fetch(`${baseUrl}/api/v1/boards/not-a-valid-uuid`, {
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /must be a valid UUID/);
    });

    it('TC-EDG-02: Missing required payload fields return HTTP 400 Validation Error', async () => {
      // 1. Missing title when creating task
      const missingTitleRes = await fetch(`${baseUrl}/api/v1/boards/${testBoardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: backlogColId,
          // title omitted!
        }),
      });
      assert.equal(missingTitleRes.status, 400);

      // 2. Missing version when updating task (OCC requirement)
      const missingVerRes = await fetch(`${baseUrl}/api/v1/tasks/00000000-0000-0000-0000-000000000000`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          title: 'Update without version',
        }),
      });
      assert.equal(missingVerRes.status, 400);
      const missingVerData = await missingVerRes.json();
      assert.match(missingVerData.error.message, /validation failed/i);
    });

    it('TC-EDG-03: Accessing deleted task or non-existent resource returns HTTP 404 Not Found', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks/00000000-0000-0000-0000-000000000000`, {
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'NOT_FOUND');
    });

    it('TC-EDG-04: Transaction atomicity & rollback: failing operations leave no partial database changes', async () => {
      // 1. Inspect initial state of tasks in Done column
      const tasksBefore = await prisma.task.findMany({
        where: { columnId: doneColId },
        orderBy: { position: 'asc' },
      });
      const initialPositions = tasksBefore.map((t) => ({ id: t.id, position: t.position, version: t.version }));

      // 2. Attempt an invalid move across columns pointing to a non-existent target column
      const invalidMoveRes = await fetch(`${baseUrl}/api/v1/tasks/${tasksBefore[0].id}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          targetColumnId: '00000000-0000-0000-0000-000000000000',
          newPosition: 0,
          version: tasksBefore[0].version,
        }),
      });

      assert.equal(invalidMoveRes.status, 400);

      // 3. Verify database state is untouched (exact positions & versions preserved, zero partial shifts)
      const tasksAfter = await prisma.task.findMany({
        where: { columnId: doneColId },
        orderBy: { position: 'asc' },
      });
      const finalPositions = tasksAfter.map((t) => ({ id: t.id, position: t.position, version: t.version }));
      assert.deepEqual(finalPositions, initialPositions);
    });

    it('TC-EDG-05: Dynamic RBAC: demoting Tenant Admin to Member immediately denies administrative actions', async () => {
      // 1. Demote Bob in Acme Engineering to MEMBER in the database
      await prisma.membership.updateMany({
        where: { userId: bobUser.id, tenantId: acmeEngTenant.id },
        data: { role: 'MEMBER' },
      });

      // 2. Bob attempts to create a board using his existing JWT token -> Immediately 403 Forbidden
      const demotedRes = await fetch(`${baseUrl}/api/v1/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          name: 'Unauthorized Board Attempt',
        }),
      });

      assert.equal(demotedRes.status, 403);
      const demotedData = await demotedRes.json();
      assert.equal(demotedData.error.code, 'FORBIDDEN');

      // 3. Restore Bob back to TENANT_ADMIN for subsequent test cleanliness
      await prisma.membership.updateMany({
        where: { userId: bobUser.id, tenantId: acmeEngTenant.id },
        data: { role: 'TENANT_ADMIN' },
      });
    });
  });

  // -------------------------------------------------------------
  // Test Group 6: Concurrent Task Operations & Column Lock Serialization
  // -------------------------------------------------------------
  describe('Concurrent Task Operations & Serialization', () => {
    let concColId;

    it('TC-MOV-CONC-01: Simultaneous task creations in the same column produce unique, contiguous integer positions', async () => {
      const { TaskService } = await import('../src/services/task.service.js');

      // Create a dedicated column for concurrency tests
      const col = await prisma.column.create({
        data: {
          tenantId: acmeEngTenant.id,
          boardId: testBoardId,
          name: `Concurrency Column ${Date.now()}`,
          position: 99,
        },
      });
      concColId = col.id;

      // Dispatch 5 concurrent task creations at the exact same instant
      const createPromises = [0, 1, 2, 3, 4].map((i) =>
        TaskService.createTask(acmeEngTenant.id, testBoardId, bobUser.id, {
          columnId: concColId,
          title: `Concurrent Task ${i}`,
          description: `Payload for task ${i}`,
          priority: 'MEDIUM',
        })
      );

      const createdTasks = await Promise.all(createPromises);
      assert.equal(createdTasks.length, 5);

      // Verify created task positions directly from PostgreSQL
      const dbTasks = await prisma.task.findMany({
        where: { columnId: concColId },
        orderBy: { position: 'asc' },
      });

      assert.equal(dbTasks.length, 5);
      const positions = dbTasks.map((t) => t.position);

      // Check uniqueness: no two tasks have the same position
      const uniquePositions = new Set(positions);
      assert.equal(uniquePositions.size, 5, 'Every concurrently created task must have a unique position');

      // Check contiguous integer sequence: [0, 1, 2, 3, 4]
      assert.deepEqual(positions, [0, 1, 2, 3, 4], 'Positions must be contiguous 0, 1, 2, 3, 4');
    });

    it('TC-MOV-CONC-02: Simultaneous task moves re-reading position under column lock maintain dense contiguous positions', async () => {
      const { TaskService } = await import('../src/services/task.service.js');

      const tasks = await prisma.task.findMany({
        where: { columnId: concColId },
        orderBy: { position: 'asc' },
      });
      assert.ok(tasks.length >= 3);

      // Move task 2 to position 0
      const moveRes = await TaskService.moveTask(acmeEngTenant.id, tasks[2].id, bobUser.id, {
        targetColumnId: concColId,
        newPosition: 0,
        version: tasks[2].version,
      });

      assert.equal(moveRes.position, 0);

      // Verify dense contiguous positions in column
      const reordered = await prisma.task.findMany({
        where: { columnId: concColId },
        orderBy: { position: 'asc' },
      });

      const positions = reordered.map((t) => t.position);
      assert.deepEqual(positions, [0, 1, 2, 3, 4], 'Positions must remain densely contiguous after move');
    });

    it('TC-MOV-CONC-03: Simultaneous column creations on the same board serialize via parent board lock and produce unique contiguous positions', async () => {
      const { ColumnService } = await import('../src/services/column.service.js');

      // Dispatch 4 concurrent column creations
      const results = await Promise.all([
        ColumnService.createColumn(acmeEngTenant.id, testBoardId, bobUser.id, { name: `Col A ${Date.now()}` }),
        ColumnService.createColumn(acmeEngTenant.id, testBoardId, bobUser.id, { name: `Col B ${Date.now()}` }),
        ColumnService.createColumn(acmeEngTenant.id, testBoardId, bobUser.id, { name: `Col C ${Date.now()}` }),
        ColumnService.createColumn(acmeEngTenant.id, testBoardId, bobUser.id, { name: `Col D ${Date.now()}` }),
      ]);

      const createdIds = results.map((c) => c.id);
      const cols = await prisma.column.findMany({
        where: { id: { in: createdIds } },
        orderBy: { position: 'asc' },
      });

      const positions = cols.map((c) => c.position);
      // Positions must be strictly ascending with no duplicates
      const uniquePositions = new Set(positions);
      assert.equal(uniquePositions.size, 4, 'All 4 column positions must be distinct');
      assert.equal(positions[1], positions[0] + 1);
      assert.equal(positions[2], positions[1] + 1);
      assert.equal(positions[3], positions[2] + 1);

      // Clean up test columns
      await prisma.column.deleteMany({ where: { id: { in: createdIds } } });
    });

    it('TC-MOV-CONC-04: Non-empty column deletion is rejected under column row lock', async () => {
      const { ColumnService } = await import('../src/services/column.service.js');

      // Attempt deleting column with tasks (concColId has tasks from TC-MOV-CONC-01)
      await assert.rejects(
        () => ColumnService.deleteColumn(acmeEngTenant.id, concColId, bobUser.id),
        (err) => {
          assert.equal(err.name, 'ValidationError');
          assert.match(err.message, /Cannot delete column containing \d+ task\(s\)/);
          return true;
        }
      );
    });
  });
});

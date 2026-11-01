import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { io as ioClient } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { initSocketIO, getRoomKey, getActiveUsers } from '../src/socket/index.js';

describe('Phase 4: Real-Time Collaboration, Socket.IO & Presence Test Suite', () => {
  let server;
  let baseUrl;
  let io;

  // Cached personas & tokens
  let acmeOrg;
  let acmeEngTenant;
  let nexusOrg;
  let nexusOpsTenant;
  let bobToken; // Tenant Admin in Engineering
  let charlieToken; // Member in Engineering
  let dianaToken; // Org Admin in Nexus (cross-org)
  let bobUser;
  let charlieUser;
  let dianaUser;
  let testBoard;
  let testColumn;

  const connectSocket = (token) => {
    return new Promise((resolve, reject) => {
      const client = ioClient(baseUrl, { auth: { token }, transports: ['websocket'] });
      client.on('connect', () => resolve(client));
      client.on('connect_error', reject);
    });
  };

  const joinBoardRoom = (client, tenantId, boardId) => {
    return new Promise((resolve, reject) => {
      client.emit('join:board', { tenantId, boardId }, (res) => {
        resolve(res);
      });
      client.once('error:unauthorized', reject);
      client.once('room:error', reject);
    });
  };

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    io = initSocketIO(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    acmeOrg = await prisma.organization.findUnique({ where: { slug: 'acme-tech' } });
    acmeEngTenant = await prisma.tenant.findFirst({
      where: { orgId: acmeOrg.id, slug: 'engineering' },
    });
    nexusOrg = await prisma.organization.findUnique({ where: { slug: 'nexus-global' } });
    nexusOpsTenant = await prisma.tenant.findFirst({
      where: { orgId: nexusOrg.id, slug: 'operations' },
    });

    // Obtain login JWTs
    const loginUser = async (email, password = 'password123') => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      return { token: data.data.token, user: data.data.user };
    };

    const bobData = await loginUser('bob@acme.com');
    bobToken = bobData.token;
    bobUser = bobData.user;

    const charlieData = await loginUser('charlie@acme.com');
    charlieToken = charlieData.token;
    charlieUser = charlieData.user;

    const dianaData = await loginUser('diana@nexus.com');
    dianaToken = dianaData.token;
    dianaUser = dianaData.user;

    // Create a dedicated board for Phase 4 tests
    const boardRes = await fetch(`${baseUrl}/api/v1/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'X-Tenant-ID': acmeEngTenant.id,
      },
      body: JSON.stringify({
        name: `Phase 4 Real-time Board ${Date.now()}`,
        description: 'Test board for Socket.IO collaboration',
      }),
    });
    const boardJson = await boardRes.json();
    testBoard = boardJson.data;

    // Fetch snapshot to get default columns
    const snapRes = await fetch(`${baseUrl}/api/v1/boards/${testBoard.id}`, {
      headers: {
        Authorization: `Bearer ${bobToken}`,
        'X-Tenant-ID': acmeEngTenant.id,
      },
    });
    const snapJson = await snapRes.json();
    testColumn = snapJson.data.columns[0]; // Backlog
  });

  after(async () => {
    if (io) {
      io.close();
    }
    if (testBoard?.id) {
      try {
        await prisma.activityLog.deleteMany({ where: { boardId: testBoard.id } });
        await prisma.task.deleteMany({ where: { boardId: testBoard.id } });
        await prisma.column.deleteMany({ where: { boardId: testBoard.id } });
        await prisma.board.delete({ where: { id: testBoard.id } });
      } catch (e) {
        console.error('Error cleaning up testBoard:', e.message);
      }
    }
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  describe('Socket Connection & JWT Authentication', () => {
    it('TC-SCK-01: Connects successfully with a valid JWT Bearer token', async () => {
      const client = await connectSocket(bobToken);
      assert.ok(client.id, 'Socket must be assigned an ID upon connection');
      client.disconnect();
    });

    it('TC-SCK-02: Rejects connection with missing or forged token with Authentication error', async () => {
      const client = ioClient(baseUrl, {
        auth: { token: 'invalid_forged_token_xyz' },
        transports: ['websocket'],
      });

      await new Promise((resolve) => {
        client.on('connect_error', (err) => {
          assert.match(err.message, /Authentication error/i);
          client.disconnect();
          resolve();
        });
      });
    });
  });

  describe('Room Authorization & Cross-Tenant Boundary Protection', () => {
    it('TC-SCK-03: Authorized user (Bob) joins board room and receives room:joined and presence:sync', async () => {
      const client = await connectSocket(bobToken);
      const res = await joinBoardRoom(client, acmeEngTenant.id, testBoard.id);

      assert.equal(res.success, true);
      assert.equal(res.boardId, testBoard.id);
      assert.equal(res.tenantId, acmeEngTenant.id);
      assert.ok(Array.isArray(res.activeUsers));
      assert.ok(res.activeUsers.some((u) => u.id === bobUser.id));

      client.disconnect();
    });

    it('TC-SCK-04: Cross-tenant / unauthorized user (Diana from Nexus) is rejected from joining Acme board room', async () => {
      const client = await connectSocket(dianaToken);

      await new Promise((resolve, reject) => {
        client.emit('join:board', { tenantId: acmeEngTenant.id, boardId: testBoard.id });

        client.on('error:unauthorized', (err) => {
          assert.equal(err.code, 'FORBIDDEN');
          assert.match(err.error, /Access forbidden|not authorized/i);
          client.disconnect();
          resolve();
        });

        client.on('room:joined', () => {
          client.disconnect();
          reject(new Error('Cross-tenant user should NOT have received room:joined!'));
        });
      });
    });
  });

  describe('Real-Time Presence & Multi-Tab Handling', () => {
    it('TC-SCK-05: Multi-tab connection from Bob shows 1 active user; closing 1 tab keeps Bob online; closing second removes Bob', async () => {
      const tab1 = await connectSocket(bobToken);
      await joinBoardRoom(tab1, acmeEngTenant.id, testBoard.id);

      const tab2 = await connectSocket(bobToken);
      await joinBoardRoom(tab2, acmeEngTenant.id, testBoard.id);

      const roomKey = getRoomKey(acmeEngTenant.id, testBoard.id);
      const activeUsers = getActiveUsers(roomKey);
      const bobEntries = activeUsers.filter((u) => u.id === bobUser.id);
      assert.equal(bobEntries.length, 1, 'Multiple tabs for Bob must appear as a single online member in presence');

      // Disconnect tab1 -> Bob must still be online
      tab1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const activeAfterTab1 = getActiveUsers(roomKey);
      assert.ok(activeAfterTab1.some((u) => u.id === bobUser.id), 'Bob must remain online while tab2 is open');

      // Disconnect tab2 -> Bob must now be offline
      tab2.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const activeAfterTab2 = getActiveUsers(roomKey);
      assert.ok(!activeAfterTab2.some((u) => u.id === bobUser.id), 'Bob must be removed from presence after all tabs close');
    });
  });

  describe('Real-Time Broadcasts after Database Commit', () => {
    let peerClient;
    let createdTaskId;

    before(async () => {
      peerClient = await connectSocket(charlieToken);
      await joinBoardRoom(peerClient, acmeEngTenant.id, testBoard.id);
    });

    after(() => {
      if (peerClient) peerClient.disconnect();
    });

    it('TC-SCK-06: Task creation via REST broadcasts task:created with monotonic version 1 and eventId', async () => {
      const eventPromise = new Promise((resolve) => {
        peerClient.once('task:created', (payload) => {
          assert.ok(payload.eventId, 'Broadcast event must include a unique eventId');
          assert.equal(payload.type, 'task:created');
          assert.equal(payload.version, 1);
          assert.equal(payload.task.title, 'Real-time WebSocket Test Task');
          assert.equal(payload.boardId, testBoard.id);
          resolve(payload);
        });
      });

      const res = await fetch(`${baseUrl}/api/v1/boards/${testBoard.id}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          columnId: testColumn.id,
          title: 'Real-time WebSocket Test Task',
          priority: 'HIGH',
        }),
      });

      const json = await res.json();
      assert.equal(res.status, 201);
      createdTaskId = json.data.id;

      await eventPromise;
    });

    it('TC-SCK-07: Task update via REST broadcasts task:updated with incremented version 2', async () => {
      const eventPromise = new Promise((resolve) => {
        peerClient.once('task:updated', (payload) => {
          assert.equal(payload.type, 'task:updated');
          assert.equal(payload.version, 2);
          assert.equal(payload.task.title, 'Real-time WebSocket Test Task (Updated)');
          resolve(payload);
        });
      });

      const res = await fetch(`${baseUrl}/api/v1/tasks/${createdTaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          title: 'Real-time WebSocket Test Task (Updated)',
          version: 1,
        }),
      });

      assert.equal(res.status, 200);
      await eventPromise;
    });

    it('TC-SCK-08: Task move via REST broadcasts task:moved with targetColumnId and version 3', async () => {
      const eventPromise = new Promise((resolve) => {
        peerClient.once('task:moved', (payload) => {
          assert.equal(payload.type, 'task:moved');
          assert.equal(payload.version, 3);
          assert.equal(payload.task.id, createdTaskId);
          resolve(payload);
        });
      });

      const res = await fetch(`${baseUrl}/api/v1/tasks/${createdTaskId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          targetColumnId: testColumn.id,
          newPosition: 0,
          version: 2,
        }),
      });

      assert.equal(res.status, 200);
      await eventPromise;
    });

    it('TC-SCK-09: Task deletion via REST broadcasts task:deleted with taskId', async () => {
      const eventPromise = new Promise((resolve) => {
        peerClient.once('task:deleted', (payload) => {
          assert.equal(payload.type, 'task:deleted');
          assert.equal(payload.taskId, createdTaskId);
          assert.equal(payload.boardId, testBoard.id);
          resolve(payload);
        });
      });

      const res = await fetch(`${baseUrl}/api/v1/tasks/${createdTaskId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 200);
      await eventPromise;
    });
  });
});

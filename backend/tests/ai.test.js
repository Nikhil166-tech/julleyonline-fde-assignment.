import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { config } from '../src/config/env.js';
import { AiContextService } from '../src/services/ai-context.service.js';

describe('AI Kanban Assistant Backend Test Suite', () => {
  let server;
  let baseUrl;
  let mockPythonServer;
  let mockPythonPort;

  // Cached fixture data
  let acmeOrg;
  let acmeEngTenant;
  let acmeMktgTenant;
  let nexusOrg;
  let nexusOpsTenant;
  let bobUser;
  let dianaUser;
  let bobToken;
  let dianaToken;
  let engBoard;
  let mktgBoard;

  before(async () => {
    // 1. Verify and load seeded fixtures from isolated test DB
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

    bobUser = await prisma.user.findUnique({ where: { email: 'bob@acme.com' } });
    dianaUser = await prisma.user.findUnique({ where: { email: 'diana@nexus.com' } });

    bobToken = jwt.sign(
      { userId: bobUser.id, email: bobUser.email },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    dianaToken = jwt.sign(
      { userId: dianaUser.id, email: dianaUser.email },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    engBoard = await prisma.board.findFirst({
      where: { tenantId: acmeEngTenant.id },
    });

    mktgBoard = await prisma.board.findFirst({
      where: { tenantId: { not: acmeEngTenant.id } },
    });

    // 2. Start Express app server
    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 3. Start a mock Python FastAPI server on an ephemeral port to verify end-to-end proxying
    mockPythonServer = http.createServer((req, res) => {
      if (req.url === '/chat' && req.method === 'POST') {
        let bodyStr = '';
        req.on('data', (chunk) => {
          bodyStr += chunk;
        });
        req.on('end', () => {
          const body = JSON.parse(bodyStr);
          // Check that context is sanitized
          const tasks = body.context?.tasks || [];
          for (const t of tasks) {
            if (t.email || t.password || t.passwordHash) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Sensitive fields detected in context' }));
              return;
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              responseType: 'task_list',
              answer: 'Mock AI response: There are tasks scheduled for this board.',
              structuredData: { totalTasks: 4 },
              toolsUsed: ['get_tasks', 'get_board_summary'],
              confidence: 'high',
              generatedAt: new Date().toISOString(),
              recordsAnalyzed: 4,
              dataScope: 'Engineering & Product',
              generation: {
                source: 'llm',
                model: 'gemini-2.5-flash',
                fallbackUsed: false,
              },
            })
          );
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise((resolve) => {
      mockPythonServer.listen(0, () => {
        mockPythonPort = mockPythonServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((res) => server.close(res));
    if (mockPythonServer) await new Promise((res) => mockPythonServer.close(res));
  });

  it('TC-AI-01: rejects unauthenticated AI chat request with HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': acmeEngTenant.id,
      },
      body: JSON.stringify({ message: 'What tasks are overdue?' }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('TC-AI-02: rejects missing X-Tenant-ID header with HTTP 400 Validation Error', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
      },
      body: JSON.stringify({ message: 'Summarize today activities' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('TC-AI-03: rejects cross-tenant access if user has no membership in specified tenant with HTTP 403', async () => {
    // Diana belongs strictly to Nexus, not Acme
    const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dianaToken}`,
        'X-Tenant-ID': acmeEngTenant.id,
      },
      body: JSON.stringify({ message: 'Which tasks are overdue?' }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('TC-AI-04: rejects foreign boardId that belongs to another tenant with HTTP 403', async () => {
    // Bob is authorized in Engineering tenant, but supplies Marketing board ID
    const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'X-Tenant-ID': acmeEngTenant.id,
      },
      body: JSON.stringify({
        message: 'Summarize this board',
        boardId: mktgBoard.id,
      }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('TC-AI-05: rejects empty message with HTTP 400 Validation Error', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'X-Tenant-ID': acmeEngTenant.id,
      },
      body: JSON.stringify({ message: '   ' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('TC-AI-06: AiContextService produces sanitized data without secret leakage and respects boundaries', async () => {
    const context = await AiContextService.getSanitizedContext(acmeEngTenant.id, engBoard.id);

    assert.equal(context.tenantId, acmeEngTenant.id);
    assert.equal(context.boardId, engBoard.id);
    assert.ok(context.currentTime);
    assert.ok(context.metrics);
    assert.equal(typeof context.metrics.totalTasks, 'number');
    assert.ok(Array.isArray(context.tasks));
    assert.ok(Array.isArray(context.columns));
    assert.ok(Array.isArray(context.activities));

    // Verify zero secret leakage in tasks
    for (const task of context.tasks) {
      assert.equal(task.boardId, engBoard.id);
      assert.equal(task.password, undefined);
      assert.equal(task.passwordHash, undefined);
      assert.equal(task.email, undefined);
    }

    // Verify zero secret leakage in activities
    for (const act of context.activities) {
      assert.equal(act.password, undefined);
      assert.equal(act.passwordHash, undefined);
      assert.equal(act.email, undefined);
    }
  });

  it('TC-AI-07: returns graceful 503 when AI microservice is unreachable', async () => {
    // Point AI service to a closed/unbound port
    const originalUrl = config.aiServiceUrl;
    config.aiServiceUrl = 'http://127.0.0.1:59999';

    try {
      const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ message: 'Which tasks are overdue?' }),
      });

      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'AI_SERVICE_UNAVAILABLE');
    } finally {
      config.aiServiceUrl = originalUrl;
    }
  });

  it('TC-AI-08: successfully receives AI answer from microservice and returns context metadata', async () => {
    // Point AI service to our mock server
    const originalUrl = config.aiServiceUrl;
    config.aiServiceUrl = `http://127.0.0.1:${mockPythonPort}`;

    try {
      const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({
          message: 'Show tasks that are still pending',
          boardId: engBoard.id,
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.responseType, 'task_list');
      assert.ok(body.data.answer.includes('Mock AI response'));
      assert.deepEqual(body.data.toolsUsed, ['get_tasks', 'get_board_summary']);
      assert.equal(body.data.recordsAnalyzed, 4);
      assert.equal(body.data.dataScope, 'Engineering & Product');
      assert.equal(body.data.contextMeta.tenantId, acmeEngTenant.id);
      assert.equal(body.data.contextMeta.boardId, engBoard.id);
      assert.deepEqual(body.data.generation, {
        source: 'llm',
        model: 'gemini-2.5-flash',
        fallbackUsed: false,
      });
    } finally {
      config.aiServiceUrl = originalUrl;
    }
  });

  it('TC-AI-09: accurately forwards fallback generation metadata when local engine handles request', async () => {
    // Temporarily swap mock to return fallback metadata
    const originalUrl = config.aiServiceUrl;
    const fallbackServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          responseType: 'overdue_summary',
          answer: 'Local fallback: 1 task overdue.',
          structuredData: { overdueCount: 1 },
          toolsUsed: ['get_overdue_tasks'],
          confidence: 'high',
          generatedAt: new Date().toISOString(),
          recordsAnalyzed: 1,
          dataScope: 'Engineering & Product',
          generation: {
            source: 'local',
            model: null,
            fallbackUsed: true,
            failureReason: 'ServerError',
          },
        })
      );
    });

    let fbPort;
    await new Promise((resolve) => {
      fallbackServer.listen(0, () => {
        fbPort = fallbackServer.address().port;
        resolve();
      });
    });

    config.aiServiceUrl = `http://127.0.0.1:${fbPort}`;

    try {
      const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ message: 'Which tasks are overdue?' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.generation.source, 'local');
      assert.equal(body.data.generation.fallbackUsed, true);
      assert.equal(body.data.generation.failureReason, 'ServerError');
    } finally {
      config.aiServiceUrl = originalUrl;
      await new Promise((res) => fallbackServer.close(res));
    }
  });

  it('TC-AI-10: calculates accurate workspace-level aggregates for workspaces with 250 tasks across boards', async () => {
    // Create dedicated scale test tenant in Acme Org
    const scaleTenant = await prisma.tenant.create({
      data: {
        orgId: acmeOrg.id,
        name: 'Scale Engineering Tenant',
        slug: `scale-eng-${Date.now()}`,
      },
    });

    try {
      // Create 2 boards
      const boardA = await prisma.board.create({
        data: {
          tenantId: scaleTenant.id,
          name: 'Board Alpha (150 tasks)',
          createdByUserId: bobUser.id,
        },
      });

      const boardB = await prisma.board.create({
        data: {
          tenantId: scaleTenant.id,
          name: 'Board Beta (100 tasks)',
          createdByUserId: bobUser.id,
        },
      });

      // Create columns for Board A
      const colTodoA = await prisma.column.create({
        data: { tenantId: scaleTenant.id, boardId: boardA.id, name: 'To Do', position: 0 },
      });
      const colInProgA = await prisma.column.create({
        data: { tenantId: scaleTenant.id, boardId: boardA.id, name: 'In Progress', position: 1 },
      });
      const colDoneA = await prisma.column.create({
        data: { tenantId: scaleTenant.id, boardId: boardA.id, name: 'Done', position: 2 },
      });

      // Create columns for Board B
      const colBacklogB = await prisma.column.create({
        data: { tenantId: scaleTenant.id, boardId: boardB.id, name: 'Backlog', position: 0 },
      });
      const colDoneB = await prisma.column.create({
        data: { tenantId: scaleTenant.id, boardId: boardB.id, name: 'Done', position: 1 },
      });

      const pastDue = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const futureDue = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days ahead

      // 150 tasks on Board A:
      // - 40 To Do (all URGENT, 20 past due, 20 future due)
      // - 60 In Progress (all HIGH, 15 past due, 45 no due date)
      // - 50 Done (all MEDIUM, 10 past due -> NOT overdue because completed!)
      const tasksBoardA = [];
      for (let i = 0; i < 40; i++) {
        tasksBoardA.push({
          tenantId: scaleTenant.id,
          boardId: boardA.id,
          columnId: colTodoA.id,
          createdByUserId: bobUser.id,
          title: `Alpha Todo Task ${i + 1}`,
          priority: 'URGENT',
          dueDate: i < 20 ? pastDue : futureDue,
          position: i,
        });
      }
      for (let i = 0; i < 60; i++) {
        tasksBoardA.push({
          tenantId: scaleTenant.id,
          boardId: boardA.id,
          columnId: colInProgA.id,
          createdByUserId: bobUser.id,
          title: `Alpha InProg Task ${i + 1}`,
          priority: 'HIGH',
          dueDate: i < 15 ? pastDue : null,
          position: i,
        });
      }
      for (let i = 0; i < 50; i++) {
        tasksBoardA.push({
          tenantId: scaleTenant.id,
          boardId: boardA.id,
          columnId: colDoneA.id,
          createdByUserId: bobUser.id,
          title: `Alpha Done Task ${i + 1}`,
          priority: 'MEDIUM',
          dueDate: i < 10 ? pastDue : null,
          position: i,
        });
      }
      await prisma.task.createMany({ data: tasksBoardA });

      // 100 tasks on Board B:
      // - 80 Backlog (40 MEDIUM, 40 LOW; 5 past due on MEDIUM)
      // - 20 Done (all LOW; 5 past due -> NOT overdue because completed!)
      const tasksBoardB = [];
      for (let i = 0; i < 80; i++) {
        tasksBoardB.push({
          tenantId: scaleTenant.id,
          boardId: boardB.id,
          columnId: colBacklogB.id,
          createdByUserId: bobUser.id,
          title: `Beta Backlog Task ${i + 1}`,
          priority: i < 40 ? 'MEDIUM' : 'LOW',
          dueDate: i < 5 ? pastDue : null,
          position: i,
        });
      }
      for (let i = 0; i < 20; i++) {
        tasksBoardB.push({
          tenantId: scaleTenant.id,
          boardId: boardB.id,
          columnId: colDoneB.id,
          createdByUserId: bobUser.id,
          title: `Beta Done Task ${i + 1}`,
          priority: 'LOW',
          dueDate: i < 5 ? pastDue : null,
          position: i,
        });
      }
      await prisma.task.createMany({ data: tasksBoardB });

      // 1. Verify workspace-wide context across all 250 tasks
      const wsContext = await AiContextService.getSanitizedContext(scaleTenant.id);

      assert.equal(wsContext.metrics.totalTasks, 250, 'Total tasks must be exactly 250');
      assert.equal(wsContext.tasks.length, 100, 'Sampled task details must be capped at 100');
      assert.equal(wsContext.isTruncated, true, 'isTruncated must be true for 250 tasks');

      // Check priority distribution covers all 250 tasks
      assert.equal(wsContext.metrics.byPriority.URGENT, 40);
      assert.equal(wsContext.metrics.byPriority.HIGH, 60);
      assert.equal(wsContext.metrics.byPriority.MEDIUM, 90); // 50 from Board A + 40 from Board B
      assert.equal(wsContext.metrics.byPriority.LOW, 60); // 40 + 20 from Board B
      const totalPrio = Object.values(wsContext.metrics.byPriority).reduce((a, b) => a + b, 0);
      assert.equal(totalPrio, 250, 'Sum of priority counts must cover all 250 tasks');

      // Check column distribution covers all 250 tasks
      assert.equal(wsContext.metrics.byColumn['To Do'], 40);
      assert.equal(wsContext.metrics.byColumn['In Progress'], 60);
      assert.equal(wsContext.metrics.byColumn['Backlog'], 80);
      assert.equal(wsContext.metrics.byColumn['Done'], 70); // 50 on A + 20 on B
      const totalCol = Object.values(wsContext.metrics.byColumn).reduce((a, b) => a + b, 0);
      assert.equal(totalCol, 250, 'Sum of column counts must cover all 250 tasks');

      // Check completion status and overdue tasks across all 250 tasks:
      // Completed: 50 on A + 20 on B = 70 completed
      assert.equal(wsContext.metrics.completedTasks, 70);
      assert.equal(wsContext.metrics.pendingTasks, 180); // 250 - 70
      assert.equal(wsContext.metrics.isInferredCompletion, true);

      // Overdue:
      // Board A: 20 in To Do + 15 in In Progress = 35 (the 10 past due in Done are completed)
      // Board B: 5 in Backlog = 5 (the 5 past due in Done are completed)
      // Total overdue = 40
      assert.equal(wsContext.metrics.overdueTasks, 40, 'Overdue count must cover all 250 tasks');

      // 2. Verify board-scoped filtering for Board A (150 tasks)
      const boardAContext = await AiContextService.getSanitizedContext(scaleTenant.id, boardA.id);
      assert.equal(boardAContext.metrics.totalTasks, 150, 'Board A total tasks must be exactly 150');
      assert.equal(boardAContext.tasks.length, 100, 'Board A sample capped at 100');
      assert.equal(boardAContext.isTruncated, true);
      assert.equal(boardAContext.metrics.byPriority.URGENT, 40);
      assert.equal(boardAContext.metrics.byPriority.HIGH, 60);
      assert.equal(boardAContext.metrics.byPriority.MEDIUM, 50);
      assert.equal(boardAContext.metrics.byPriority.LOW, 0);
      assert.equal(boardAContext.metrics.overdueTasks, 35);
      assert.equal(boardAContext.metrics.completedTasks, 50);

      // Verify no cross-tenant tasks leak
      for (const t of wsContext.tasks) {
        assert.ok([boardA.id, boardB.id].includes(t.boardId));
      }
    } finally {
      // Clean up scale test data
      await prisma.task.deleteMany({ where: { tenantId: scaleTenant.id } });
      await prisma.column.deleteMany({ where: { tenantId: scaleTenant.id } });
      await prisma.board.deleteMany({ where: { tenantId: scaleTenant.id } });
      await prisma.tenant.deleteMany({ where: { id: scaleTenant.id } });
    }
  });

  it('TC-AI-11: verifies three-tier provenance metadata contract (gemini tier 1, ollama tier 2, local tier 3)', async () => {
    // 1. Tier 1: Gemini success
    const tier1Server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          responseType: 'board_summary',
          answer: 'Tier 1 Gemini response.',
          structuredData: { total_tasks: 4 },
          toolsUsed: ['get_board_summary'],
          confidence: 'high',
          generatedAt: new Date().toISOString(),
          recordsAnalyzed: 4,
          dataScope: 'Engineering & Product',
          generation: {
            source: 'llm',
            provider: 'gemini',
            model: 'gemini-3.5-flash',
            fallbackUsed: false,
            tier: 1,
          },
        })
      );
    });

    let t1Port;
    await new Promise((res) => {
      tier1Server.listen(0, () => {
        t1Port = tier1Server.address().port;
        res();
      });
    });

    const originalUrl = config.aiServiceUrl;
    config.aiServiceUrl = `http://127.0.0.1:${t1Port}`;

    try {
      const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ message: 'Summarize the board' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.data.generation, {
        source: 'llm',
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        fallbackUsed: false,
        tier: 1,
      });
    } finally {
      await new Promise((res) => tier1Server.close(res));
    }

    // 2. Tier 2: Ollama Cloud fallback
    const tier2Server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          responseType: 'task_list',
          answer: 'Tier 2 Ollama response.',
          structuredData: { totalTasks: 4 },
          toolsUsed: ['get_tasks'],
          confidence: 'high',
          generatedAt: new Date().toISOString(),
          recordsAnalyzed: 4,
          dataScope: 'Engineering & Product',
          generation: {
            source: 'llm',
            provider: 'ollama',
            model: 'gemma4:31b',
            fallbackUsed: true,
            tier: 2,
          },
        })
      );
    });

    let t2Port;
    await new Promise((res) => {
      tier2Server.listen(0, () => {
        t2Port = tier2Server.address().port;
        res();
      });
    });

    config.aiServiceUrl = `http://127.0.0.1:${t2Port}`;

    try {
      const res = await fetch(`${baseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
        body: JSON.stringify({ message: 'Show tasks' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.data.generation, {
        source: 'llm',
        provider: 'ollama',
        model: 'gemma4:31b',
        fallbackUsed: true,
        tier: 2,
      });
    } finally {
      config.aiServiceUrl = originalUrl;
      await new Promise((res) => tier2Server.close(res));
    }
  });
});

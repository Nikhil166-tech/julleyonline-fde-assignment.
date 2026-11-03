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
});

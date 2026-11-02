import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { config } from '../src/config/env.js';
import { createAuthRateLimiter } from '../src/middlewares/rateLimiter.js';
import { Role } from '@prisma/client';

describe('Phase 1B: Authentication, Tenant Scoping & RBAC Comprehensive Test Suite', () => {
  let server;
  let baseUrl;

  // Cached data for tests
  let acmeOrg;
  let acmeEngTenant;
  let acmeMktgTenant;
  let nexusOrg;
  let nexusOpsTenant;
  let nexusCsTenant;
  let aliceToken;
  let bobToken;
  let charlieToken;

  before(async () => {
    // Start test server
    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Load seeded entities for context tests
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
    nexusCsTenant = await prisma.tenant.findFirst({
      where: { orgId: nexusOrg.id, slug: 'customer-success' },
    });

    // Obtain tokens via login
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
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // -------------------------------------------------------------
  // Test Group 1: Registration, Bootstrap & Privilege Escalation
  // -------------------------------------------------------------
  describe('Registration & Organization Bootstrap', () => {
    const timestamp = Date.now();
    const testOrgEmail = `founder_${timestamp}@startup.io`;
    const testOrgSlug = `startup-${timestamp}`;

    it('TC-AUT-01: POST /api/v1/auth/register bootstraps org, tenant, and initial Org Admin', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Founder',
          email: testOrgEmail,
          password: 'securePassword123',
          organizationName: `Startup ${timestamp}`,
          organizationSlug: testOrgSlug,
          tenantName: 'Primary Workspace',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.user.email, testOrgEmail);
      assert.equal(data.data.organization.slug, testOrgSlug);
      assert.ok(data.data.token, 'JWT token should be returned');

      // Verify in DB that Org Admin membership exists with tenant_id = null
      const orgInDb = await prisma.organization.findUnique({
        where: { slug: testOrgSlug },
        include: { memberships: true, tenants: true },
      });
      assert.ok(orgInDb);
      assert.equal(orgInDb.tenants.length, 1);
      assert.equal(orgInDb.memberships.length, 2);

      const orgAdminMem = orgInDb.memberships.find((m) => m.tenantId === null);
      assert.ok(orgAdminMem);
      assert.equal(orgAdminMem.role, 'ORG_ADMIN');
    });

    it('TC-AUT-02: rejects duplicate user email with HTTP 409 Conflict', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Founder 2',
          email: testOrgEmail,
          password: 'securePassword123',
          organizationName: `Another Org ${Date.now()}`,
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'CONFLICT');
      assert.match(data.error.message, /email address already exists/);
    });

    it('TC-AUT-03: rejects duplicate organization slug with HTTP 409 Conflict', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Other Founder',
          email: `other_${Date.now()}@test.com`,
          password: 'securePassword123',
          organizationName: 'Different Name',
          organizationSlug: testOrgSlug,
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'CONFLICT');
      assert.match(data.error.message, /slug.*already exists/);
    });

    it('TC-AUT-04: rejects invalid fields with HTTP 400 Validation Error', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'A',
          email: 'not-an-email',
          password: '123',
          organizationName: 'B',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('TC-AUT-05: ignores role injection during registration (no privilege escalation)', async () => {
      const evilEmail = `evil_${Date.now()}@test.com`;
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Evil User',
          email: evilEmail,
          password: 'securePassword123',
          organizationName: `Injected Org ${Date.now()}`,
          role: 'SUPER_ADMIN_INJECTED', // Malicious field
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify that no invalid or injected role was assigned
      const createdUser = await prisma.user.findUnique({
        where: { email: evilEmail },
        include: { memberships: true },
      });
      for (const m of createdUser.memberships) {
        assert.ok(['ORG_ADMIN', 'TENANT_ADMIN'].includes(m.role));
      }
    });

    it('TC-AUT-06: handles concurrent registration attempts atomically without corruption', async () => {
      const concurrentEmail = `race_${Date.now()}@concurrency.test`;
      const concurrentSlug = `race-${Date.now()}`;

      const payload = {
        name: 'Concurrent Registrant',
        email: concurrentEmail,
        password: 'securePassword123',
        organizationName: 'Race Condition Corp',
        organizationSlug: concurrentSlug,
      };

      // Fire 2 simultaneous registration requests
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one should succeed (201) and the other should be rejected (409)
      assert.deepEqual(statuses, [201, 409]);
    });

    it('TC-AUT-07: registers successfully without organizationSlug or with empty string slugs (auto-generation)', async () => {
      const ts = Date.now();
      const autoSlugEmail = `autoslug_${ts}@autogen.io`;
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Auto Slug Founder',
          email: autoSlugEmail,
          password: 'securePassword123',
          organizationName: `Auto Generated Venture ${ts}`,
          organizationSlug: '', // Empty string slug like previous form submitted
          tenantName: 'Primary Workspace',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.user.email, autoSlugEmail);
      assert.ok(data.data.organization.slug.startsWith('auto-generated-venture'));
      assert.ok(data.data.token);

      // Verify in DB that workspace was created with auto-slug
      const orgInDb = await prisma.organization.findUnique({
        where: { id: data.data.organization.id },
        include: { tenants: true, memberships: true },
      });
      assert.equal(orgInDb.tenants.length, 1);
      assert.equal(orgInDb.tenants[0].name, 'Primary Workspace');
      assert.equal(orgInDb.memberships.length, 2); // 1 Org Admin + 1 Tenant Admin
    });

    it('TC-AUT-08: rejects non-alphanumeric organization name producing empty slug with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Slug User',
          email: `invalidslug_${Date.now()}@example.com`,
          password: 'securePassword123',
          organizationName: '!!!',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  // -------------------------------------------------------------
  // Test Group 2: Login, Logout & Token Integrity
  // -------------------------------------------------------------
  describe('Login, Logout & Token Integrity', () => {
    it('TC-LOG-01: successful login returns JWT and user memberships without password hash', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alice@acme.com',
          password: 'password123',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.user.email, 'alice@acme.com');
      assert.equal(data.data.user.passwordHash, undefined, 'Password hash must never be exposed');
      assert.ok(data.data.token, 'Token must be present');
      assert.ok(Array.isArray(data.data.memberships));
    });

    it('TC-LOG-02: rejects login with incorrect password with HTTP 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alice@acme.com',
          password: 'wrongPassword!321',
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('TC-LOG-03: GET /api/v1/auth/me returns authenticated user profile', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.email, 'alice@acme.com');
      assert.ok(data.data.memberships.length > 0);
    });

    it('TC-LOG-04: rejects request without token with HTTP 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/me`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('TC-LOG-05: rejects expired JWT with HTTP 401 Unauthorized', async () => {
      // Create an already-expired token (expired 5 seconds ago)
      const expiredToken = jwt.sign(
        { userId: acmeOrg.id, email: 'expired@test.com' },
        config.jwtSecret,
        { expiresIn: '-5s' }
      );

      const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
      assert.match(data.error.message, /expired/i);
    });

    it('TC-LOG-06: rejects tampered JWT with invalid signature with HTTP 401 Unauthorized', async () => {
      // Sign with an incorrect secret
      const forgedToken = jwt.sign(
        { userId: acmeOrg.id, email: 'forged@test.com' },
        'completely_wrong_secret_123456789',
        { expiresIn: '1h' }
      );

      const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${forgedToken}` },
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHORIZED');
      assert.match(data.error.message, /Invalid authentication token/i);
    });

    it('TC-LOG-07: POST /api/v1/auth/logout succeeds with valid JWT and documents stateless behavior', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.match(data.message, /logged out successfully/i);
    });
  });

  // -------------------------------------------------------------
  // Test Group 3: Tenant Isolation & Cross-Organization Boundaries
  // -------------------------------------------------------------
  describe('Tenant Isolation & Cross-Organization Boundaries', () => {
    it('TC-TNT-01: allows tenant member to access tenant workspace', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.tenantId, acmeEngTenant.id);
      assert.equal(data.membership.role, 'TENANT_ADMIN');
    });

    it('TC-TNT-02: allows Org Admin to access any tenant within their organization', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.tenantId, acmeEngTenant.id);
      assert.equal(data.membership.role, 'ORG_ADMIN');
    });

    it('TC-TNT-03: rejects cross-tenant access with HTTP 403 Forbidden', async () => {
      // Charlie belongs only to Acme Engineering; attempts accessing Nexus Operations
      const res = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': nexusOpsTenant.id,
        },
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'FORBIDDEN');
    });

    it('TC-TNT-04: rejects cross-organization access even for an Org Admin', async () => {
      // Alice is Org Admin of Acme Technologies, NOT Nexus Global
      const res = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': nexusOpsTenant.id, // Nexus tenant
        },
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN');
      assert.match(data.error.message, /You do not have access to this tenant workspace/);
    });

    it('TC-TNT-05: rejects request when X-Tenant-ID header is missing with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('TC-TNT-06: Org Admin assigned as Member to tenant retains effectiveRole: ORG_ADMIN', async () => {
      const alice = await prisma.user.findUnique({ where: { email: 'alice@acme.com' } });
      const tempMem = await prisma.membership.create({
        data: {
          userId: alice.id,
          orgId: acmeOrg.id,
          tenantId: acmeEngTenant.id,
          role: 'MEMBER',
        },
      });

      try {
        const res = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': acmeEngTenant.id,
          },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.membership.role, 'ORG_ADMIN');
      } finally {
        await prisma.membership.delete({ where: { id: tempMem.id } });
      }
    });
  });

  // -------------------------------------------------------------
  // Test Group 4: Dynamic Membership Revocation & Role Demotion
  // -------------------------------------------------------------
  describe('Dynamic Membership Verification & Revocation', () => {
    it('TC-REV-01: immediately rejects request when user membership is revoked from database', async () => {
      // 1. Create a dedicated test user and tenant membership
      const uniqueSuffix = Date.now();
      const tempUser = await prisma.user.create({
        data: {
          name: 'Revoke Test User',
          email: `revoke_${uniqueSuffix}@test.com`,
          passwordHash: 'dummyhash',
        },
      });

      const tempMembership = await prisma.membership.create({
        data: {
          userId: tempUser.id,
          orgId: acmeOrg.id,
          tenantId: acmeEngTenant.id,
          role: Role.MEMBER,
        },
      });

      const tempToken = jwt.sign(
        { userId: tempUser.id, email: tempUser.email, name: tempUser.name },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      // 2. Request should succeed before revocation
      const resBefore = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${tempToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resBefore.status, 200);

      // 3. Delete the membership in PostgreSQL (revocation)
      await prisma.membership.delete({ where: { id: tempMembership.id } });

      // 4. Request with the SAME active token must now be rejected immediately!
      const resAfter = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${tempToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resAfter.status, 403);
      const dataAfter = await resAfter.json();
      assert.equal(dataAfter.error.code, 'FORBIDDEN');
    });

    it('TC-REV-02: immediately enforces role demotion on subsequent requests', async () => {
      // 1. Create user with TENANT_ADMIN
      const uniqueSuffix = Date.now();
      const tempAdmin = await prisma.user.create({
        data: {
          name: 'Demote Test User',
          email: `demote_${uniqueSuffix}@test.com`,
          passwordHash: 'dummyhash',
        },
      });

      const tempMembership = await prisma.membership.create({
        data: {
          userId: tempAdmin.id,
          orgId: acmeOrg.id,
          tenantId: acmeEngTenant.id,
          role: Role.TENANT_ADMIN,
        },
      });

      const tempToken = jwt.sign(
        { userId: tempAdmin.id, email: tempAdmin.email, name: tempAdmin.name },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      // 2. Admin endpoint should succeed initially
      const resBefore = await fetch(`${baseUrl}/api/v1/auth/admin-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tempToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resBefore.status, 200);

      // 3. Demote user from TENANT_ADMIN to MEMBER in PostgreSQL
      await prisma.membership.update({
        where: { id: tempMembership.id },
        data: { role: Role.MEMBER },
      });

      // 4. Immediate re-check on admin endpoint must fail with 403 Forbidden!
      const resAfter = await fetch(`${baseUrl}/api/v1/auth/admin-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tempToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resAfter.status, 403);
      const dataAfter = await resAfter.json();
      assert.equal(dataAfter.error.code, 'FORBIDDEN');
    });
  });

  // -------------------------------------------------------------
  // Test Group 5: Rate Limiting
  // -------------------------------------------------------------
  describe('Authentication Rate Limiting', () => {
    it('TC-RAT-01: throttles excessive login requests exceeding rate limit threshold', async () => {
      const express = (await import('express')).default;
      const throttledLimiter = createAuthRateLimiter({ max: 3, windowMs: 10000 });
      const rateApp = express();
      rateApp.use(throttledLimiter);
      rateApp.post('/api/test-limit', (req, res) => res.status(200).json({ success: true }));

      const rateTestServer = http.createServer(rateApp);
      await new Promise((resolve) => rateTestServer.listen(0, resolve));
      const ratePort = rateTestServer.address().port;

      try {
        const sendReq = () =>
          fetch(`http://127.0.0.1:${ratePort}/api/test-limit`, {
            method: 'POST',
          });

        // First 3 requests must succeed (200)
        const r1 = await sendReq();
        const r2 = await sendReq();
        const r3 = await sendReq();
        assert.equal(r1.status, 200);
        assert.equal(r2.status, 200);
        assert.equal(r3.status, 200);

        // 4th request must be throttled with HTTP 429 Too Many Requests
        const r4 = await sendReq();
        assert.equal(r4.status, 429);
        const data4 = await r4.json();
        assert.equal(data4.error.code, 'TOO_MANY_REQUESTS');
      } finally {
        await new Promise((resolve) => rateTestServer.close(resolve));
      }
    });
  });

  // -------------------------------------------------------------
  // Test Group 6: Specific Persona Verification (Alice, Bob, Charlie)
  // -------------------------------------------------------------
  describe('Assignment Persona Access Verification (Alice, Bob, Charlie)', () => {
    // 1. Bob verification
    it('TC-PER-01: Bob can act as Tenant Admin in Engineering', async () => {
      // Context access
      const resContext = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resContext.status, 200);
      const dataContext = await resContext.json();
      assert.equal(dataContext.membership.role, 'TENANT_ADMIN');

      // Admin operation
      const resAdmin = await fetch(`${baseUrl}/api/v1/auth/admin-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resAdmin.status, 200);
    });

    it('TC-PER-02: Bob can act as Member in Marketing, but CANNOT perform admin actions in Marketing', async () => {
      // Context access as Member
      const resContext = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeMktgTenant.id,
        },
      });
      assert.equal(resContext.status, 200);
      const dataContext = await resContext.json();
      assert.equal(dataContext.membership.role, 'MEMBER');

      // Admin action must be REJECTED in Marketing!
      const resAdmin = await fetch(`${baseUrl}/api/v1/auth/admin-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeMktgTenant.id,
        },
      });
      assert.equal(resAdmin.status, 403);
      const dataAdmin = await resAdmin.json();
      assert.equal(dataAdmin.error.code, 'FORBIDDEN');
    });

    it('TC-PER-03: Bob cannot execute Org Admin exclusive actions in any tenant', async () => {
      const resOrgAdmin = await fetch(`${baseUrl}/api/v1/auth/org-admin-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resOrgAdmin.status, 403);
      const dataOrgAdmin = await resOrgAdmin.json();
      assert.equal(dataOrgAdmin.error.code, 'FORBIDDEN');
    });

    // 2. Charlie verification
    it('TC-PER-04: Charlie CANNOT access Marketing or any Nexus organization data', async () => {
      // 1. Marketing access attempt
      const resMktg = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': acmeMktgTenant.id,
        },
      });
      assert.equal(resMktg.status, 403);
      const dataMktg = await resMktg.json();
      assert.equal(dataMktg.error.code, 'FORBIDDEN');

      // 2. Nexus Operations attempt
      const resNexusOps = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': nexusOpsTenant.id,
        },
      });
      assert.equal(resNexusOps.status, 403);
      const dataNexusOps = await resNexusOps.json();
      assert.equal(dataNexusOps.error.code, 'FORBIDDEN');

      // 3. Nexus Customer Success attempt
      const resNexusCs = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'X-Tenant-ID': nexusCsTenant.id,
        },
      });
      assert.equal(resNexusCs.status, 403);
      const dataNexusCs = await resNexusCs.json();
      assert.equal(dataNexusCs.error.code, 'FORBIDDEN');
    });

    // 3. Alice verification
    it('TC-PER-05: Alice has Org Admin access across all Acme tenants, but is strictly restricted from Nexus', async () => {
      // Allowed: Acme Engineering
      const resEng = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resEng.status, 200);
      const dataEng = await resEng.json();
      assert.equal(dataEng.membership.role, 'ORG_ADMIN');

      // Allowed: Acme Marketing
      const resMktg = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': acmeMktgTenant.id,
        },
      });
      assert.equal(resMktg.status, 200);
      const dataMktg = await resMktg.json();
      assert.equal(dataMktg.membership.role, 'ORG_ADMIN');

      // Allowed: Org Admin exclusive action in Acme
      const resOrgAdmin = await fetch(`${baseUrl}/api/v1/auth/org-admin-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': acmeEngTenant.id,
        },
      });
      assert.equal(resOrgAdmin.status, 200);

      // BLOCKED: Nexus Operations
      const resNexusOps = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': nexusOpsTenant.id,
        },
      });
      assert.equal(resNexusOps.status, 403);

      // BLOCKED: Nexus Customer Success
      const resNexusCs = await fetch(`${baseUrl}/api/v1/auth/context-test`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': nexusCsTenant.id,
        },
      });
      assert.equal(resNexusCs.status, 403);
    });
  });
});

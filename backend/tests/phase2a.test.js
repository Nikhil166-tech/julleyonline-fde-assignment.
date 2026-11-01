import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { Role } from '@prisma/client';

describe('Phase 2A: Organization, Tenant and Membership Management Test Suite', () => {
  let server;
  let baseUrl;

  // Cached entities
  let acmeOrg;
  let acmeEngTenant;
  let acmeMktgTenant;
  let nexusOrg;
  let nexusOpsTenant;
  let aliceToken;
  let bobToken;
  let charlieToken;
  let dianaToken;

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
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // -------------------------------------------------------------
  // Test Group 1: Organization Listing & Scoping
  // -------------------------------------------------------------
  describe('Organization Listing & Permissions', () => {
    it('TC-ORG-01: Alice (Org Admin) lists organizations and sees all tenants in Acme', async () => {
      const res = await fetch(`${baseUrl}/api/v1/organizations`, {
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.data));

      const acme = data.data.find((o) => o.id === acmeOrg.id);
      assert.ok(acme, 'Alice must see Acme Technologies');
      assert.equal(acme.isOrgAdmin, true);
      assert.ok(acme.tenants.length >= 2, 'Alice sees all tenants');

      const nexus = data.data.find((o) => o.id === nexusOrg.id);
      assert.equal(nexus, undefined, 'Alice must not see Nexus organization');
    });

    it('TC-ORG-02: Charlie (Member) sees only assigned tenants in his organization', async () => {
      const res = await fetch(`${baseUrl}/api/v1/organizations`, {
        headers: { Authorization: `Bearer ${charlieToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const acme = data.data.find((o) => o.id === acmeOrg.id);
      assert.ok(acme);
      assert.equal(acme.isOrgAdmin, false);

      // Charlie belongs only to Engineering, not Marketing
      const tenantSlugs = acme.tenants.map((t) => t.slug);
      assert.ok(tenantSlugs.includes('engineering'));
      assert.ok(!tenantSlugs.includes('marketing'), 'Charlie must not see Marketing tenant');
    });

    it('TC-ORG-03: GET /api/v1/organizations/:orgId returns organization details', async () => {
      const res = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.name, 'Acme Technologies');
    });

    it('TC-ORG-04: rejects viewing unauthorized organization with HTTP 403 Forbidden', async () => {
      // Charlie tries to view Nexus organization
      const res = await fetch(`${baseUrl}/api/v1/organizations/${nexusOrg.id}`, {
        headers: { Authorization: `Bearer ${charlieToken}` },
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN');
    });

    it('TC-ORG-05: Alice (Org Admin) updates organization name; non-admin is rejected', async () => {
      // Bob (Tenant Admin) tries to update org -> 403
      const resBob = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Acme Hacked' }),
      });
      assert.equal(resBob.status, 403);

      // Alice (Org Admin) updates org -> 200
      const resAlice = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Acme Technologies Global' }),
      });
      assert.equal(resAlice.status, 200);
      const dataAlice = await resAlice.json();
      assert.equal(dataAlice.data.name, 'Acme Technologies Global');

      // Revert name back
      await prisma.organization.update({
        where: { id: acmeOrg.id },
        data: { name: 'Acme Technologies' },
      });
    });
  });

  // -------------------------------------------------------------
  // Test Group 2: Tenant CRUD & Permission Boundary
  // -------------------------------------------------------------
  describe('Tenant Management & Boundary Rules', () => {
    let createdTenantId;

    it('TC-TNT-01: Alice (Org Admin) creates a new tenant; Bob & Charlie are rejected with 403', async () => {
      const newTenantPayload = {
        name: 'Infrastructure & Cloud',
        slug: `infra-${Date.now()}`,
      };

      // 1. Charlie (Member) attempt -> 403
      const resCharlie = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}/tenants`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTenantPayload),
      });
      assert.equal(resCharlie.status, 403);

      // 2. Bob (Tenant Admin) attempt -> 403
      const resBob = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}/tenants`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTenantPayload),
      });
      assert.equal(resBob.status, 403);

      // 3. Alice (Org Admin) attempt -> 201 Created
      const resAlice = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}/tenants`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTenantPayload),
      });
      assert.equal(resAlice.status, 201);
      const dataAlice = await resAlice.json();
      assert.equal(dataAlice.success, true);
      assert.equal(dataAlice.data.name, newTenantPayload.name);
      assert.equal(dataAlice.data.slug, newTenantPayload.slug);
      createdTenantId = dataAlice.data.id;
    });

    it('TC-TNT-02: rejects duplicate tenant slug within the same organization with HTTP 409', async () => {
      const res = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}/tenants`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Duplicate Engineering',
          slug: 'engineering', // already exists in Acme
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.error.code, 'CONFLICT');
      assert.match(data.error.message, /already exists/);
    });

    it('TC-TNT-03: view specific tenant details with permission check', async () => {
      // Bob can view Engineering (200)
      const resBob = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      assert.equal(resBob.status, 200);

      // Charlie CANNOT view Marketing (403)
      const resCharlie = await fetch(`${baseUrl}/api/v1/tenants/${acmeMktgTenant.id}`, {
        headers: { Authorization: `Bearer ${charlieToken}` },
      });
      assert.equal(resCharlie.status, 403);
    });

    it('TC-TNT-04: Tenant Admin can update tenant name; Member is rejected with 403', async () => {
      // Charlie (Member) tries to update Engineering -> 403
      const resCharlie = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Hacked Engineering' }),
      });
      assert.equal(resCharlie.status, 403);

      // Bob (Tenant Admin) updates Engineering -> 200
      const resBob = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Engineering & Systems' }),
      });
      assert.equal(resBob.status, 200);
      const dataBob = await resBob.json();
      assert.equal(dataBob.data.name, 'Engineering & Systems');

      // Revert name back
      await prisma.tenant.update({
        where: { id: acmeEngTenant.id },
        data: { name: 'Engineering & Product' },
      });
    });

    it('TC-TNT-05: only Org Admin can delete a tenant workspace (cascade deletion)', async () => {
      // Bob (Tenant Admin) tries to delete created tenant -> 403
      const resBob = await fetch(`${baseUrl}/api/v1/tenants/${createdTenantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      assert.equal(resBob.status, 403);

      // Alice (Org Admin) deletes tenant -> 200
      const resAlice = await fetch(`${baseUrl}/api/v1/tenants/${createdTenantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      assert.equal(resAlice.status, 200);

      // Verify deletion in DB
      const deletedTenant = await prisma.tenant.findUnique({ where: { id: createdTenantId } });
      assert.equal(deletedTenant, null);
    });
  });

  // -------------------------------------------------------------
  // Test Group 3: Membership Management & Role Assignment
  // -------------------------------------------------------------
  describe('Tenant Membership Management', () => {
    let testMemberUserId;
    let addedMembershipId;

    before(async () => {
      // Create a standalone user to test inviting/adding
      const user = await prisma.user.create({
        data: {
          name: 'Dave Developer',
          email: `dave_${Date.now()}@acme.com`,
          passwordHash: 'dummyhash',
        },
      });
      testMemberUserId = user.id;
    });

    it('TC-MBR-01: lists tenant members with sanitized profile attributes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}/members`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 2);

      for (const m of data.data) {
        assert.ok(m.membershipId);
        assert.ok(m.userId);
        assert.ok(m.email);
        assert.equal(m.passwordHash, undefined, 'Password hash must never be in member list');
      }
    });

    it('TC-MBR-02: Tenant Admin adds member to tenant; Member is rejected with 403', async () => {
      const targetUser = await prisma.user.findUnique({ where: { id: testMemberUserId } });

      // Charlie (Member) tries to add member -> 403
      const resCharlie = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: targetUser.email,
          role: Role.MEMBER,
        }),
      });
      assert.equal(resCharlie.status, 403);

      // Bob (Tenant Admin) adds member -> 201
      const resBob = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: targetUser.email,
          role: Role.MEMBER,
        }),
      });
      assert.equal(resBob.status, 201);
      const dataBob = await resBob.json();
      assert.equal(dataBob.success, true);
      assert.equal(dataBob.data.email, targetUser.email);
      assert.equal(dataBob.data.role, Role.MEMBER);
      addedMembershipId = dataBob.data.membershipId;
    });

    it('TC-MBR-03: rejects adding already-existing member to tenant with HTTP 409 Conflict', async () => {
      const targetUser = await prisma.user.findUnique({ where: { id: testMemberUserId } });

      const res = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: targetUser.email,
          role: Role.MEMBER,
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.error.code, 'CONFLICT');
      assert.match(data.error.message, /already a member/);
    });

    it('TC-MBR-04: rejects assigning ORG_ADMIN at the tenant level with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'someuser@test.com',
          role: Role.ORG_ADMIN, // Invalid for tenant level
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('TC-MBR-05: updates tenant member role (Member -> Tenant Admin)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}/members/${addedMembershipId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: Role.TENANT_ADMIN }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.data.role, Role.TENANT_ADMIN);
    });

    it('TC-MBR-06: removes member from tenant workspace', async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenants/${acmeEngTenant.id}/members/${addedMembershipId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify deletion in DB
      const memInDb = await prisma.membership.findUnique({ where: { id: addedMembershipId } });
      assert.equal(memInDb, null);
    });

    it('TC-MBR-07: prevents removing the last Organization Administrator of an organization', async () => {
      // Find Alice's org-level membership
      const aliceOrgMem = await prisma.membership.findFirst({
        where: {
          userId: (await prisma.user.findUnique({ where: { email: 'alice@acme.com' } })).id,
          orgId: acmeOrg.id,
          tenantId: null,
          role: Role.ORG_ADMIN,
        },
      });
      assert.ok(aliceOrgMem);

      // Attempt deletion of the only Org Admin in Acme
      const res = await fetch(`${baseUrl}/api/v1/organizations/${acmeOrg.id}/members/${aliceOrgMem.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION_ERROR');
      assert.match(data.error.message, /Cannot remove the last Organization Administrator/);
    });
  });

  // -------------------------------------------------------------
  // Test Group 4: Context Switcher & Workspace Resolution
  // -------------------------------------------------------------
  describe('Context Switcher APIs', () => {
    it('TC-SWT-01: GET /api/v1/auth/me/contexts returns accessible organizations & tenants', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/me/contexts`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.data));

      const acme = data.data.find((o) => o.id === acmeOrg.id);
      assert.ok(acme);
      assert.equal(acme.tenants.length, 2); // Engineering and Marketing
    });

    it('TC-SWT-02: POST /api/v1/auth/switch-context switches active tenant context safely', async () => {
      // Switch Bob to Marketing (role: MEMBER)
      const resMktg = await fetch(`${baseUrl}/api/v1/auth/switch-context`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId: acmeMktgTenant.id }),
      });

      assert.equal(resMktg.status, 200);
      const dataMktg = await resMktg.json();
      assert.equal(dataMktg.success, true);
      assert.equal(dataMktg.data.tenantId, acmeMktgTenant.id);
      assert.equal(dataMktg.data.effectiveRole, Role.MEMBER);

      // Switch Bob to Engineering (role: TENANT_ADMIN)
      const resEng = await fetch(`${baseUrl}/api/v1/auth/switch-context`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId: acmeEngTenant.id }),
      });

      assert.equal(resEng.status, 200);
      const dataEng = await resEng.json();
      assert.equal(dataEng.data.effectiveRole, Role.TENANT_ADMIN);
    });

    it('TC-SWT-03: rejects switching to unauthorized tenant with HTTP 403 Forbidden', async () => {
      // Bob attempts switching to Nexus Operations
      const res = await fetch(`${baseUrl}/api/v1/auth/switch-context`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId: nexusOpsTenant.id }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN');
    });
  });
});

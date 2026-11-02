import { prisma } from '../config/prisma.js';
import { ConflictError, NotFoundError, ForbiddenError, BadRequestError, ValidationError } from '../errors/AppError.js';
import { Role } from '@prisma/client';

function slugify(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export class OrgService {
  /**
   * Create a new organization for an authenticated user
   */
  static async createOrganization(userId, { name, slug }) {
    const rawOrgSlug = slug ? String(slug).trim() : slugify(name);
    const orgSlug = rawOrgSlug.slice(0, 100);

    if (!orgSlug || orgSlug.length < 2 || !/[a-z0-9]/i.test(orgSlug)) {
      throw new ValidationError('Cannot generate a valid slug from the provided name. Name must contain alphanumeric characters.');
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { slug: orgSlug },
    });
    if (existingOrg) {
      throw new ConflictError(`An organization with slug "${orgSlug}" already exists`);
    }

    return prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug: orgSlug,
        },
      });

      const defaultTenant = await tx.tenant.create({
        data: {
          orgId: org.id,
          name: 'Default Workspace',
          slug: 'default',
        },
      });

      // User becomes Org Admin
      await tx.membership.create({
        data: {
          userId,
          orgId: org.id,
          tenantId: null,
          role: Role.ORG_ADMIN,
        },
      });

      // User becomes Tenant Admin of default workspace
      await tx.membership.create({
        data: {
          userId,
          orgId: org.id,
          tenantId: defaultTenant.id,
          role: Role.TENANT_ADMIN,
        },
      });

      return {
        ...org,
        tenants: [defaultTenant],
      };
    });
  }
  /**
   * List all organizations accessible by the user,
   * with tenants scoped strictly to what the user is authorized to view.
   */
  static async listUserOrganizations(userId) {
    // 1. Fetch all memberships for this user
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            tenants: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                name: true,
                slug: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (memberships.length === 0) {
      return [];
    }

    // 2. Group by organization
    const orgMap = new Map();

    for (const m of memberships) {
      const org = m.organization;
      if (!orgMap.has(org.id)) {
        orgMap.set(org.id, {
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
          isOrgAdmin: false,
          userRoles: [],
          accessibleTenants: [],
          allTenants: org.tenants,
        });
      }

      const entry = orgMap.get(org.id);
      entry.userRoles.push({
        membershipId: m.id,
        tenantId: m.tenantId,
        role: m.role,
      });

      if (m.tenantId === null && m.role === Role.ORG_ADMIN) {
        entry.isOrgAdmin = true;
      }
    }

    // 3. Filter tenants according to permission matrix
    const result = [];
    for (const org of orgMap.values()) {
      let tenants;
      if (org.isOrgAdmin) {
        // Org Admin sees all tenants in their organization
        tenants = org.allTenants.map((t) => ({
          ...t,
          userRole: Role.ORG_ADMIN,
        }));
      } else {
        // Tenant Admin or Member only sees assigned tenants
        const userTenantRoleMap = new Map();
        for (const r of org.userRoles) {
          if (r.tenantId) {
            userTenantRoleMap.set(r.tenantId, r.role);
          }
        }

        tenants = org.allTenants
          .filter((t) => userTenantRoleMap.has(t.id))
          .map((t) => ({
            ...t,
            userRole: userTenantRoleMap.get(t.id),
          }));
      }

      result.push({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
        isOrgAdmin: org.isOrgAdmin,
        tenants,
      });
    }

    return result;
  }

  /**
   * Get specific organization by ID with authorized tenants
   */
  static async getOrganization(orgId, userId) {
    const userOrgs = await this.listUserOrganizations(userId);
    const target = userOrgs.find((o) => o.id === orgId);

    if (!target) {
      // Check if org exists to give proper 403 vs 404
      const orgExists = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!orgExists) {
        throw new NotFoundError('Organization not found');
      }
      throw new ForbiddenError('Access forbidden: You are not a member of this organization');
    }

    return target;
  }

  /**
   * Update organization details (strictly Org Admin)
   */
  static async updateOrganization(orgId, userId, { name, slug }) {
    // 1. Verify Org Admin privilege
    const orgAdminMem = await prisma.membership.findFirst({
      where: {
        userId,
        orgId,
        tenantId: null,
        role: Role.ORG_ADMIN,
      },
    });

    if (!orgAdminMem) {
      throw new ForbiddenError('Access forbidden: Operation requires Organization Administrator privileges');
    }

    // 2. Slug collision check
    if (slug) {
      const existingSlug = await prisma.organization.findFirst({
        where: {
          slug,
          NOT: { id: orgId },
        },
      });

      if (existingSlug) {
        throw new ConflictError(`Organization slug "${slug}" is already in use`);
      }
    }

    // 3. Apply update
    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
      },
    });

    return updated;
  }

  /**
   * Delete organization and all subordinate entities (strictly Org Admin)
   * With safe dependency policy requiring force=true if subordinate resources exist
   */
  static async deleteOrganization(orgId, userId, { force = false } = {}) {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const orgAdminMem = await prisma.membership.findFirst({
      where: {
        userId,
        orgId,
        tenantId: null,
        role: Role.ORG_ADMIN,
      },
    });

    if (!orgAdminMem) {
      throw new ForbiddenError('Access forbidden: Operation requires Organization Administrator privileges');
    }

    if (!force) {
      const tenantCount = await prisma.tenant.count({ where: { orgId } });
      const boardCount = await prisma.board.count({ where: { tenant: { orgId } } });
      const taskCount = await prisma.task.count({ where: { column: { board: { tenant: { orgId } } } } });

      if (tenantCount > 0 || boardCount > 0 || taskCount > 0) {
        throw new BadRequestError(
          `Cannot delete organization containing active resources (${tenantCount} workspaces, ${boardCount} boards, ${taskCount} tasks). Pass force=true query parameter to confirm permanent deletion.`,
          { tenantCount, boardCount, taskCount }
        );
      }
    }

    await prisma.organization.delete({
      where: { id: orgId },
    });

    return { success: true, message: 'Organization and all subordinate data deleted successfully' };
  }
}

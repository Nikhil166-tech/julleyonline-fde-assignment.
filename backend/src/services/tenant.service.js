import { prisma } from '../config/prisma.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../errors/AppError.js';
import { Role } from '@prisma/client';

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class TenantService {
  /**
   * Create a new tenant in the organization (strictly Org Admin)
   */
  static async createTenant(orgId, userId, { name, slug }) {
    // 1. Verify user is Org Admin
    const orgAdminMem = await prisma.membership.findFirst({
      where: {
        userId,
        orgId,
        tenantId: null,
        role: Role.ORG_ADMIN,
      },
    });

    if (!orgAdminMem) {
      throw new ForbiddenError('Access forbidden: Only Organization Administrators can create tenants');
    }

    const tenantSlug = slug || slugify(name);

    // 2. Uniqueness check within the organization
    const existing = await prisma.tenant.findUnique({
      where: {
        orgId_slug: {
          orgId,
          slug: tenantSlug,
        },
      },
    });

    if (existing) {
      throw new ConflictError(`A tenant with slug "${tenantSlug}" already exists in this organization`);
    }

    // 3. Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        orgId,
        name,
        slug: tenantSlug,
      },
    });

    return tenant;
  }

  /**
   * List tenants in an organization with role filtering
   */
  static async listTenants(orgId, userId) {
    // 1. Check if user is Org Admin
    const orgAdminMem = await prisma.membership.findFirst({
      where: {
        userId,
        orgId,
        tenantId: null,
        role: Role.ORG_ADMIN,
      },
    });

    if (orgAdminMem) {
      return prisma.tenant.findMany({
        where: { orgId },
        orderBy: { createdAt: 'asc' },
      });
    }

    // 2. Otherwise return only assigned tenants
    const userMemberships = await prisma.membership.findMany({
      where: {
        userId,
        orgId,
        tenantId: { not: null },
      },
      select: { tenantId: true },
    });

    const tenantIds = userMemberships.map((m) => m.tenantId).filter(Boolean);

    return prisma.tenant.findMany({
      where: {
        id: { in: tenantIds },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get specific tenant details with permission verification
   */
  static async getTenant(tenantId, userId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { organization: true },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant workspace not found');
    }

    // Check permission: either tenant member or parent org admin
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        OR: [
          { tenantId: tenant.id },
          { orgId: tenant.orgId, tenantId: null, role: Role.ORG_ADMIN },
        ],
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access forbidden: You do not have access to this tenant workspace');
    }

    return {
      ...tenant,
      effectiveRole: membership.role,
    };
  }

  /**
   * Update tenant details (Org Admin or Tenant Admin of this tenant)
   */
  static async updateTenant(tenantId, userId, { name, slug }) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundError('Tenant workspace not found');
    }

    // Check authority: Org Admin of org, or Tenant Admin of this tenant
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        OR: [
          { orgId: tenant.orgId, tenantId: null, role: Role.ORG_ADMIN },
          { tenantId: tenant.id, role: Role.TENANT_ADMIN },
        ],
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access forbidden: Operation requires Tenant Admin or Org Admin privileges');
    }

    // Check slug collision if changing
    if (slug && slug !== tenant.slug) {
      const existing = await prisma.tenant.findUnique({
        where: {
          orgId_slug: {
            orgId: tenant.orgId,
            slug,
          },
        },
      });

      if (existing) {
        throw new ConflictError(`Tenant slug "${slug}" already exists in this organization`);
      }
    }

    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
      },
    });
  }

  /**
   * Delete tenant workspace (strictly Org Admin)
   */
  static async deleteTenant(tenantId, userId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundError('Tenant workspace not found');
    }

    // Strictly Org Admin
    const orgAdminMem = await prisma.membership.findFirst({
      where: {
        userId,
        orgId: tenant.orgId,
        tenantId: null,
        role: Role.ORG_ADMIN,
      },
    });

    if (!orgAdminMem) {
      throw new ForbiddenError('Access forbidden: Only Organization Administrators can delete tenant workspaces');
    }

    await prisma.tenant.delete({
      where: { id: tenantId },
    });

    return { success: true, message: 'Tenant workspace deleted successfully' };
  }
}

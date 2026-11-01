import { ValidationError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import { prisma } from '../config/prisma.js';
import { Role } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireTenantContext(req, res, next) {
  try {
    const tenantIdHeader = req.headers['x-tenant-id'];

    if (!tenantIdHeader) {
      throw new ValidationError('X-Tenant-ID header is required for this operation');
    }

    if (!UUID_REGEX.test(tenantIdHeader)) {
      throw new ValidationError('X-Tenant-ID header must be a valid UUID');
    }

    // 1. Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdHeader },
      include: { organization: true },
    });

    if (!tenant) {
      throw new NotFoundError('Target tenant workspace not found');
    }

    // 2. Resolve user membership
    // Check tenant-specific membership first
    let membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        tenantId: tenant.id,
      },
    });

    // If not found, check if user is an Org Admin with org-level membership (tenantId = null)
    if (!membership) {
      const orgAdminMembership = await prisma.membership.findFirst({
        where: {
          userId: req.user.id,
          orgId: tenant.orgId,
          tenantId: null,
          role: Role.ORG_ADMIN,
        },
      });

      if (orgAdminMembership) {
        membership = {
          ...orgAdminMembership,
          // Scope effective role for this tenant session as ORG_ADMIN
          role: Role.ORG_ADMIN,
        };
      }
    }

    if (!membership) {
      throw new ForbiddenError('Access forbidden: You do not have access to this tenant workspace');
    }

    // Attach verified tenant context to request
    req.tenantId = tenant.id;
    req.tenant = tenant;
    req.membership = {
      id: membership.id,
      role: membership.role,
      tenantId: tenant.id,
      orgId: tenant.orgId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

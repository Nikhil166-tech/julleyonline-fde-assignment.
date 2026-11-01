import { ValidationError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import { prisma } from '../config/prisma.js';
import { Role } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireOrgContext(req, res, next) {
  try {
    const orgIdParam = req.params.orgId || req.headers['x-organization-id'];

    if (!orgIdParam) {
      throw new ValidationError('Organization ID must be provided in URL parameters or X-Organization-ID header');
    }

    if (!UUID_REGEX.test(orgIdParam)) {
      throw new ValidationError('Organization ID must be a valid UUID');
    }

    // 1. Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgIdParam },
    });

    if (!organization) {
      throw new NotFoundError('Target organization not found');
    }

    // 2. Resolve user's relationship with this organization
    const userMemberships = await prisma.membership.findMany({
      where: {
        userId: req.user.id,
        orgId: organization.id,
      },
    });

    if (!userMemberships || userMemberships.length === 0) {
      throw new ForbiddenError('Access forbidden: You do not have access to this organization');
    }

    // Check if user holds the Org-level Org Admin role (tenantId === null)
    const orgAdminMembership = userMemberships.find(
      (m) => m.tenantId === null && m.role === Role.ORG_ADMIN
    );

    req.orgId = organization.id;
    req.organization = organization;
    req.userOrgMemberships = userMemberships;
    req.isOrgAdmin = Boolean(orgAdminMembership);
    req.orgAdminMembership = orgAdminMembership || null;

    next();
  } catch (error) {
    next(error);
  }
}

export function requireOrgAdmin(req, res, next) {
  if (!req.isOrgAdmin) {
    return next(
      new ForbiddenError('Access forbidden: Operation requires Organization Administrator privileges')
    );
  }
  next();
}

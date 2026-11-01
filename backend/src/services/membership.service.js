import { prisma } from '../config/prisma.js';
import { ConflictError, NotFoundError, ForbiddenError, ValidationError } from '../errors/AppError.js';
import { Role } from '@prisma/client';

export class MembershipService {
  /**
   * Helper to verify actor's authority over a tenant
   */
  static async resolveActorTenantRole(tenantId, actorUserId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { organization: true },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant workspace not found');
    }

    // Check if actor is an Org Admin of the parent organization
    const orgAdminMem = await prisma.membership.findFirst({
      where: {
        userId: actorUserId,
        orgId: tenant.orgId,
        tenantId: null,
        role: Role.ORG_ADMIN,
      },
    });

    if (orgAdminMem) {
      return { tenant, role: Role.ORG_ADMIN, isOrgAdmin: true };
    }

    // Check if actor has a direct tenant membership
    const tenantMem = await prisma.membership.findFirst({
      where: {
        userId: actorUserId,
        tenantId: tenant.id,
      },
    });

    if (!tenantMem) {
      throw new ForbiddenError('Access forbidden: You do not have access to this tenant workspace');
    }

    return { tenant, role: tenantMem.role, isOrgAdmin: false };
  }

  /**
   * List all members of a tenant workspace
   */
  static async listTenantMembers(tenantId, actorUserId) {
    // Requires actor to be at least a member of the tenant or an org admin
    await this.resolveActorTenantRole(tenantId, actorUserId);

    const members = await prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.createdAt,
      createdAt: m.createdAt,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
      },
    }));
  }

  /**
   * Add a new member to the tenant workspace (Org Admin or Tenant Admin)
   */
  static async addTenantMember(tenantId, actorUserId, { email, role }) {
    const { tenant, role: actorRole, isOrgAdmin } = await this.resolveActorTenantRole(tenantId, actorUserId);

    // Only Org Admin or Tenant Admin can add members
    if (!isOrgAdmin && actorRole !== Role.TENANT_ADMIN) {
      throw new ForbiddenError('Access forbidden: Only Tenant Admins or Org Admins can add members');
    }

    // Prevent privilege escalation: Cannot grant ORG_ADMIN at tenant level
    if (role === Role.ORG_ADMIN) {
      throw new ValidationError('Cannot assign Organization Administrator role at the tenant level');
    }

    // Find the target user by email
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      throw new NotFoundError(`User with email "${email}" was not found. The user must register first.`);
    }

    // Check if user is already a member of this tenant
    const existing = await prisma.membership.findFirst({
      where: {
        userId: targetUser.id,
        tenantId,
      },
    });

    if (existing) {
      throw new ConflictError(`User is already a member of this tenant with role ${existing.role}`);
    }

    // Create membership within tenant
    const membership = await prisma.membership.create({
      data: {
        userId: targetUser.id,
        orgId: tenant.orgId,
        tenantId: tenant.id,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      membershipId: membership.id,
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      avatarUrl: membership.user.avatarUrl,
      role: membership.role,
      joinedAt: membership.createdAt,
    };
  }

  /**
   * Update a tenant member's role (Tenant Admin or Org Admin)
   */
  static async updateTenantMemberRole(tenantId, membershipId, actorUserId, { role }) {
    const { tenant, role: actorRole, isOrgAdmin } = await this.resolveActorTenantRole(tenantId, actorUserId);

    if (!isOrgAdmin && actorRole !== Role.TENANT_ADMIN) {
      throw new ForbiddenError('Access forbidden: Only Tenant Admins or Org Admins can modify member roles');
    }

    if (role === Role.ORG_ADMIN) {
      throw new ValidationError('Cannot assign Organization Administrator role at the tenant level');
    }

    const targetMembership = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!targetMembership || targetMembership.tenantId !== tenantId) {
      throw new NotFoundError('Target membership not found in this tenant');
    }

    // Tenant Admin cannot modify an Org Admin's membership
    if (!isOrgAdmin) {
      const isTargetOrgAdmin = await prisma.membership.findFirst({
        where: {
          userId: targetMembership.userId,
          orgId: tenant.orgId,
          tenantId: null,
          role: Role.ORG_ADMIN,
        },
      });

      if (isTargetOrgAdmin) {
        throw new ForbiddenError('Access forbidden: Tenant Admins cannot alter an Organization Administrator');
      }
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      membershipId: updated.id,
      userId: updated.user.id,
      name: updated.user.name,
      email: updated.user.email,
      role: updated.role,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Remove a member from the tenant workspace
   */
  static async removeTenantMember(tenantId, membershipId, actorUserId) {
    const { tenant, role: actorRole, isOrgAdmin } = await this.resolveActorTenantRole(tenantId, actorUserId);

    const targetMembership = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!targetMembership || targetMembership.tenantId !== tenantId) {
      throw new NotFoundError('Target membership not found in this tenant');
    }

    // An actor can remove themselves (leave tenant) or must be Tenant Admin / Org Admin
    const isSelf = targetMembership.userId === actorUserId;

    if (!isSelf && !isOrgAdmin && actorRole !== Role.TENANT_ADMIN) {
      throw new ForbiddenError('Access forbidden: Only Tenant Admins or Org Admins can remove members');
    }

    // Tenant Admin cannot remove an Org Admin
    if (!isOrgAdmin && !isSelf) {
      const isTargetOrgAdmin = await prisma.membership.findFirst({
        where: {
          userId: targetMembership.userId,
          orgId: tenant.orgId,
          tenantId: null,
          role: Role.ORG_ADMIN,
        },
      });

      if (isTargetOrgAdmin) {
        throw new ForbiddenError('Access forbidden: Tenant Admins cannot remove an Organization Administrator');
      }
    }

    await prisma.membership.delete({
      where: { id: membershipId },
    });

    return { success: true, message: 'Member removed from tenant workspace successfully' };
  }

  /**
   * Remove an Org-level member, with strict protection against removing the LAST Org Admin
   */
  static async removeOrgMember(orgId, membershipId, actorUserId) {
    // 1. Verify actor is Org Admin
    const actorOrgAdmin = await prisma.membership.findFirst({
      where: {
        userId: actorUserId,
        orgId,
        tenantId: null,
        role: Role.ORG_ADMIN,
      },
    });

    if (!actorOrgAdmin) {
      throw new ForbiddenError('Access forbidden: Operation requires Organization Administrator privileges');
    }

    const target = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!target || target.orgId !== orgId) {
      throw new NotFoundError('Target membership not found in this organization');
    }

    // 2. CRITICAL SECURITY RULE: If target is Org Admin, ensure not removing the last one!
    if (target.tenantId === null && target.role === Role.ORG_ADMIN) {
      const orgAdminCount = await prisma.membership.count({
        where: {
          orgId,
          tenantId: null,
          role: Role.ORG_ADMIN,
        },
      });

      if (orgAdminCount <= 1) {
        throw new ValidationError('Cannot remove the last Organization Administrator of the organization');
      }
    }

    await prisma.membership.delete({
      where: { id: membershipId },
    });

    return { success: true, message: 'Organization member removed successfully' };
  }
}

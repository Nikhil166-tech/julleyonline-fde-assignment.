import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { signToken } from '../utils/jwt.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../errors/AppError.js';
import { Role } from '@prisma/client';

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class AuthService {
  /**
   * Atomic organization bootstrap:
   * 1. Check uniqueness of user email & org slug
   * 2. Hash password with bcrypt
   * 3. Create User, Organization, default Tenant
   * 4. Create Org-level Membership (ORG_ADMIN, tenant_id=null)
   * 5. Create Tenant-level Membership (TENANT_ADMIN)
   * 6. Issue JWT
   */
  static async registerOrg({
    name,
    email,
    password,
    organizationName,
    organizationSlug,
    tenantName,
  }) {
    const slug = organizationSlug || slugify(organizationName);

    // Uniqueness pre-checks
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    const existingOrg = await prisma.organization.findUnique({ where: { slug } });
    if (existingOrg) {
      throw new ConflictError(`An organization with slug "${slug}" already exists`);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
        },
      });

      // 2. Create Organization
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
        },
      });

      // 3. Create Default Tenant
      const defaultTenantSlug = slugify(tenantName || 'general');
      const tenant = await tx.tenant.create({
        data: {
          orgId: organization.id,
          name: tenantName || 'General Workspace',
          slug: defaultTenantSlug,
        },
      });

      // 4. Create Org-level Membership (Org Admin)
      const orgMembership = await tx.membership.create({
        data: {
          userId: user.id,
          orgId: organization.id,
          tenantId: null, // Org-level scope
          role: Role.ORG_ADMIN,
        },
      });

      // 5. Create Tenant-level Membership (Tenant Admin for default workspace)
      await tx.membership.create({
        data: {
          userId: user.id,
          orgId: organization.id,
          tenantId: tenant.id,
          role: Role.TENANT_ADMIN,
        },
      });

      return { user, organization, tenant, orgMembership };
    });

    const token = signToken({
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
    });

    return {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        avatarUrl: result.user.avatarUrl,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
      defaultTenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
      token,
    };
  }

  /**
   * User login:
   * Validates credentials, loads accessible organizations & tenants, issues JWT.
   */
  static async login({ email, password }) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
            tenant: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
        },
        tenant: m.tenant
          ? {
              id: m.tenant.id,
              name: m.tenant.name,
              slug: m.tenant.slug,
            }
          : null,
      })),
      token,
    };
  }

  /**
   * Fetch current user profile with memberships
   */
  static async getCurrentUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
            tenant: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
        },
        tenant: m.tenant
          ? {
              id: m.tenant.id,
              name: m.tenant.name,
              slug: m.tenant.slug,
            }
          : null,
      })),
    };
  }
}

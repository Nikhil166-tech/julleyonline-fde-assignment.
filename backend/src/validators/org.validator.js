import { z } from 'zod';
import { Role } from '@prisma/client';

export const createOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters long').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters long')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')
    .optional(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')
    .optional(),
}).refine((data) => data.name !== undefined || data.slug !== undefined, {
  message: 'At least one field (name or slug) must be provided for update',
});

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Tenant name must be at least 2 characters long').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters long')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')
    .optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')
    .optional(),
}).refine((data) => data.name !== undefined || data.slug !== undefined, {
  message: 'At least one field (name or slug) must be provided for update',
});

export const addTenantMemberSchema = z.object({
  email: z.string().email('Valid email address is required').transform((v) => v.toLowerCase().trim()),
  role: z.enum([Role.TENANT_ADMIN, Role.MEMBER], {
    errorMap: () => ({ message: 'Tenant member role must be either TENANT_ADMIN or MEMBER' }),
  }),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum([Role.TENANT_ADMIN, Role.MEMBER], {
    errorMap: () => ({ message: 'Updated role must be either TENANT_ADMIN or MEMBER' }),
  }),
});

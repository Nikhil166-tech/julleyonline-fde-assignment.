import { z } from 'zod';

export const registerOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long').max(100),
  email: z.string().email('Valid email address is required').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters long').max(100),
  organizationSlug: z
    .string()
    .min(2, 'Slug must be at least 2 characters long')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  tenantName: z.string().min(2).max(100).default('General Workspace'),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email address is required').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

export const tenantHeaderSchema = z.object({
  'x-tenant-id': z.string().uuid('Invalid X-Tenant-ID header format; UUID expected'),
});

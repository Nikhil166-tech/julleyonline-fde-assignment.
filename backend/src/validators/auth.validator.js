import { z } from 'zod';

export const registerOrgSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters long').max(100),
    email: z.string().email('Valid email address is required').transform((v) => v.toLowerCase().trim()),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    organizationName: z.string().min(2, 'Organization name must be at least 2 characters long').max(100).optional(),
    orgName: z.string().min(2, 'Organization name must be at least 2 characters long').max(100).optional(),
    organizationSlug: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string()
        .min(2, 'Slug must be at least 2 characters long')
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
        .optional()
    ),
    orgSlug: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string()
        .min(2, 'Slug must be at least 2 characters long')
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
        .optional()
    ),
    tenantName: z
      .preprocess(
        (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
        z.string().min(2).max(100).optional()
      )
      .default('General Workspace'),
  })
  .transform((data) => ({
    ...data,
    organizationName: data.organizationName || data.orgName,
    organizationSlug: data.organizationSlug || data.orgSlug,
  }))
  .refine((data) => !!data.organizationName && data.organizationName.trim().length >= 2, {
    message: 'Organization name must be at least 2 characters long',
    path: ['organizationName'],
  });

export const loginSchema = z.object({
  email: z.string().email('Valid email address is required').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

export const tenantHeaderSchema = z.object({
  'x-tenant-id': z.string().uuid('Invalid X-Tenant-ID header format; UUID expected'),
});

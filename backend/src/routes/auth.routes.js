import { Router } from 'express';
import { AuthService } from '../services/auth.service.js';
import { OrgService } from '../services/org.service.js';
import { TenantService } from '../services/tenant.service.js';
import { registerOrgSchema, loginSchema } from '../validators/auth.validator.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireTenantContext } from '../middlewares/tenant.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { authRateLimiter } from '../middlewares/rateLimiter.js';
import { Role } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// Registration handler (supports both /register and /register-org)
const handleRegistration = async (req, res, next) => {
  try {
    // Strip any disallowed role escalation injection from request body
    const { role, ...sanitizedBody } = req.body;
    const validatedData = registerOrgSchema.parse(sanitizedBody);

    const result = await AuthService.registerOrg(validatedData);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/register
router.post('/register', authRateLimiter, handleRegistration);

// POST /api/v1/auth/register-org
router.post('/register-org', authRateLimiter, handleRegistration);

// POST /api/v1/auth/login
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await AuthService.login(validatedData);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
  /**
   * Stateless JWT Logout:
   * Client purges the token from local storage/memory.
   */
  res.status(200).json({
    success: true,
    message: 'User logged out successfully. Invalidate local token cache.',
  });
});

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const userProfile = await AuthService.getCurrentUser(req.user.id);

    res.status(200).json({
      success: true,
      data: userProfile,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/auth/me/contexts - List accessible organizations and tenants for UI switcher
router.get('/me/contexts', authenticateToken, async (req, res, next) => {
  try {
    const contexts = await OrgService.listUserOrganizations(req.user.id);
    res.status(200).json({
      success: true,
      data: contexts,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/switch-context - Validate and switch active tenant context
const switchContextSchema = z.object({
  tenantId: z.string().uuid('Invalid tenantId format'),
});

router.post('/switch-context', authenticateToken, async (req, res, next) => {
  try {
    const { tenantId } = switchContextSchema.parse(req.body);
    const tenantContext = await TenantService.getTenant(tenantId, req.user.id);

    res.status(200).json({
      success: true,
      message: `Active context switched to tenant: ${tenantContext.name}`,
      data: {
        tenantId: tenantContext.id,
        tenantName: tenantContext.name,
        tenantSlug: tenantContext.slug,
        organizationId: tenantContext.orgId,
        organizationName: tenantContext.organization?.name,
        effectiveRole: tenantContext.effectiveRole,
      },
    });
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------
// Development & Test Only Diagnostic Endpoints
// (Not exposed in production builds)
// -------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
  // GET /api/v1/auth/context-test
  router.get('/context-test', authenticateToken, requireTenantContext, (req, res) => {
    res.status(200).json({
      success: true,
      user: req.user,
      tenantId: req.tenantId,
      tenantName: req.tenant.name,
      membership: req.membership,
    });
  });

  // POST /api/v1/auth/admin-test
  router.post(
    '/admin-test',
    authenticateToken,
    requireTenantContext,
    requireRole(Role.ORG_ADMIN, Role.TENANT_ADMIN),
    (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Admin authorization verified',
        role: req.membership.role,
      });
    }
  );

  // POST /api/v1/auth/org-admin-test
  router.post(
    '/org-admin-test',
    authenticateToken,
    requireTenantContext,
    requireRole(Role.ORG_ADMIN),
    (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Org Admin authorization verified',
        role: req.membership.role,
      });
    }
  );
}

export default router;

import { Router } from 'express';
import { OrgService } from '../services/org.service.js';
import { TenantService } from '../services/tenant.service.js';
import { MembershipService } from '../services/membership.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireOrgContext, requireOrgAdmin } from '../middlewares/org.middleware.js';
import {
  createTenantSchema,
  updateOrgSchema,
} from '../validators/org.validator.js';

const router = Router();

// All organization routes require authentication
router.use(authenticateToken);

// GET /api/v1/organizations - List user's organizations and authorized tenants
router.get('/', async (req, res, next) => {
  try {
    const orgs = await OrgService.listUserOrganizations(req.user.id);
    res.status(200).json({
      success: true,
      data: orgs,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/organizations/:orgId - Get organization details
router.get('/:orgId', requireOrgContext, async (req, res, next) => {
  try {
    const org = await OrgService.getOrganization(req.orgId, req.user.id);
    res.status(200).json({
      success: true,
      data: org,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/organizations/:orgId - Update organization (strictly Org Admin)
router.patch('/:orgId', requireOrgContext, requireOrgAdmin, async (req, res, next) => {
  try {
    const validatedData = updateOrgSchema.parse(req.body);
    const updated = await OrgService.updateOrganization(req.orgId, req.user.id, validatedData);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/organizations/:orgId - Delete organization (strictly Org Admin)
router.delete('/:orgId', requireOrgContext, requireOrgAdmin, async (req, res, next) => {
  try {
    const result = await OrgService.deleteOrganization(req.orgId, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/organizations/:orgId/tenants - List tenants in this organization
router.get('/:orgId/tenants', requireOrgContext, async (req, res, next) => {
  try {
    const tenants = await TenantService.listTenants(req.orgId, req.user.id);
    res.status(200).json({
      success: true,
      data: tenants,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/organizations/:orgId/tenants - Create a new tenant (strictly Org Admin)
router.post('/:orgId/tenants', requireOrgContext, requireOrgAdmin, async (req, res, next) => {
  try {
    const validatedData = createTenantSchema.parse(req.body);
    const tenant = await TenantService.createTenant(req.orgId, req.user.id, validatedData);
    res.status(201).json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/organizations/:orgId/members/:membershipId - Remove an Org Admin/member (protects last Org Admin)
router.delete('/:orgId/members/:membershipId', requireOrgContext, requireOrgAdmin, async (req, res, next) => {
  try {
    const result = await MembershipService.removeOrgMember(req.orgId, req.params.membershipId, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

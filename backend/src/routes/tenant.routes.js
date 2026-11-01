import { Router } from 'express';
import { TenantService } from '../services/tenant.service.js';
import { MembershipService } from '../services/membership.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { prisma } from '../config/prisma.js';
import { revokeUserFromTenant } from '../socket/index.js';
import {
  updateTenantSchema,
  addTenantMemberSchema,
  updateMemberRoleSchema,
} from '../validators/org.validator.js';

const router = Router();

// All tenant routes require authentication
router.use(authenticateToken);

// GET /api/v1/tenants/:tenantId - View tenant details
router.get('/:tenantId', async (req, res, next) => {
  try {
    const tenant = await TenantService.getTenant(req.params.tenantId, req.user.id);
    res.status(200).json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/tenants/:tenantId - Update tenant name/slug (Tenant Admin or Org Admin)
router.patch('/:tenantId', async (req, res, next) => {
  try {
    const validatedData = updateTenantSchema.parse(req.body);
    const updated = await TenantService.updateTenant(req.params.tenantId, req.user.id, validatedData);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/tenants/:tenantId - Delete tenant workspace (strictly Org Admin)
router.delete('/:tenantId', async (req, res, next) => {
  try {
    const result = await TenantService.deleteTenant(req.params.tenantId, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/tenants/:tenantId/members - List all members of the tenant
router.get('/:tenantId/members', async (req, res, next) => {
  try {
    const members = await MembershipService.listTenantMembers(req.params.tenantId, req.user.id);
    res.status(200).json({
      success: true,
      data: members,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tenants/:tenantId/members - Add a new member to the tenant (Tenant Admin or Org Admin)
router.post('/:tenantId/members', async (req, res, next) => {
  try {
    const validatedData = addTenantMemberSchema.parse(req.body);
    const member = await MembershipService.addTenantMember(req.params.tenantId, req.user.id, validatedData);
    res.status(201).json({
      success: true,
      data: member,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/tenants/:tenantId/members/:membershipId - Update a tenant member's role
router.patch('/:tenantId/members/:membershipId', async (req, res, next) => {
  try {
    const validatedData = updateMemberRoleSchema.parse(req.body);
    const updated = await MembershipService.updateTenantMemberRole(
      req.params.tenantId,
      req.params.membershipId,
      req.user.id,
      validatedData
    );
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/tenants/:tenantId/members/:membershipId - Remove member from tenant
router.delete('/:tenantId/members/:membershipId', async (req, res, next) => {
  try {
    const existingMembership = await prisma.membership.findUnique({
      where: { id: req.params.membershipId },
      select: { userId: true },
    });

    const result = await MembershipService.removeTenantMember(
      req.params.tenantId,
      req.params.membershipId,
      req.user.id
    );

    if (existingMembership) {
      await revokeUserFromTenant(req.params.tenantId, existingMembership.userId);
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

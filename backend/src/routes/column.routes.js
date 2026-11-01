import { Router } from 'express';
import { ColumnService } from '../services/column.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireTenantContext } from '../middlewares/tenant.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { ValidationError } from '../errors/AppError.js';
import { prisma } from '../config/prisma.js';
import { broadcastToBoard } from '../socket/index.js';
import {
  updateColumnSchema,
  moveColumnSchema,
} from '../validators/board.validator.js';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuidParam(paramName) {
  return (req, res, next) => {
    const val = req.params[paramName];
    if (val && !UUID_REGEX.test(val)) {
      return next(new ValidationError(`Invalid ${paramName}: must be a valid UUID`));
    }
    next();
  };
}

router.use(authenticateToken);
router.use(requireTenantContext);

// PUT /api/v1/columns/:columnId - Rename column (Admin only)
router.put('/:columnId', validateUuidParam('columnId'), requireRole('ORG_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
  try {
    const validatedData = updateColumnSchema.parse(req.body);
    const updated = await ColumnService.updateColumn(req.tenantId, req.params.columnId, req.user.id, validatedData);

    broadcastToBoard(req.tenantId, updated.boardId, 'column:updated', { column: updated });

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/columns/:columnId/move - Reorder column (Admin only)
router.post('/:columnId/move', validateUuidParam('columnId'), requireRole('ORG_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
  try {
    const validatedData = moveColumnSchema.parse(req.body);
    const moved = await ColumnService.moveColumn(req.tenantId, req.params.columnId, req.user.id, validatedData);

    broadcastToBoard(req.tenantId, moved.boardId, 'column:moved', { column: moved });

    res.status(200).json({
      success: true,
      data: moved,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/columns/:columnId - Delete column (Admin only, checks non-empty policy)
router.delete('/:columnId', validateUuidParam('columnId'), requireRole('ORG_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
  try {
    const existingCol = await prisma.column.findUnique({
      where: { id: req.params.columnId },
      select: { boardId: true },
    });

    const result = await ColumnService.deleteColumn(req.tenantId, req.params.columnId, req.user.id);

    if (existingCol) {
      broadcastToBoard(req.tenantId, existingCol.boardId, 'column:deleted', {
        columnId: req.params.columnId,
        boardId: existingCol.boardId,
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

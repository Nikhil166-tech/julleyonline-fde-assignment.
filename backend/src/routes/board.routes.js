import { Router } from 'express';
import { BoardService } from '../services/board.service.js';
import { ColumnService } from '../services/column.service.js';
import { TaskService } from '../services/task.service.js';
import { ActivityService } from '../services/activity.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireTenantContext } from '../middlewares/tenant.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { ValidationError } from '../errors/AppError.js';
import { broadcastToBoard } from '../socket/index.js';
import {
  createBoardSchema,
  updateBoardSchema,
  createColumnSchema,
  createTaskSchema,
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

// All board endpoints require authentication and valid tenant context header
router.use(authenticateToken);
router.use(requireTenantContext);

// GET /api/v1/boards - List all boards in the tenant
router.get('/', async (req, res, next) => {
  try {
    const boards = await BoardService.listBoards(req.tenantId);
    res.status(200).json({
      success: true,
      data: boards,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/boards - Create a board with default columns (Admin only)
router.post('/', requireRole('ORG_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
  try {
    const validatedData = createBoardSchema.parse(req.body);
    const board = await BoardService.createBoard(req.tenantId, req.user.id, validatedData);
    res.status(201).json({
      success: true,
      data: board,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/boards/:boardId - Fetch board snapshot with columns and ordered tasks
router.get('/:boardId', validateUuidParam('boardId'), async (req, res, next) => {
  try {
    const board = await BoardService.getBoard(req.tenantId, req.params.boardId);
    res.status(200).json({
      success: true,
      data: board,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/boards/:boardId - Update board name or description (Admin only)
router.put('/:boardId', validateUuidParam('boardId'), requireRole('ORG_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
  try {
    const validatedData = updateBoardSchema.parse(req.body);
    const updated = await BoardService.updateBoard(req.tenantId, req.params.boardId, req.user.id, validatedData);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/boards/:boardId - Delete board and cascade (Admin only)
router.delete('/:boardId', validateUuidParam('boardId'), requireRole('ORG_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
  try {
    const result = await BoardService.deleteBoard(req.tenantId, req.params.boardId, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/boards/:boardId/activities - Get activity feed for a board
router.get('/:boardId/activities', validateUuidParam('boardId'), async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const activities = await ActivityService.getBoardActivities(req.tenantId, req.params.boardId, limit);
    res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/boards/:boardId/columns - Add a column to board (Admin only)
router.post('/:boardId/columns', validateUuidParam('boardId'), requireRole('ORG_ADMIN', 'TENANT_ADMIN'), async (req, res, next) => {
  try {
    const validatedData = createColumnSchema.parse(req.body);
    const column = await ColumnService.createColumn(req.tenantId, req.params.boardId, req.user.id, validatedData);

    // Broadcast column creation after commit
    broadcastToBoard(req.tenantId, req.params.boardId, 'column:created', { column });

    res.status(201).json({
      success: true,
      data: column,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/boards/:boardId/tasks - Create a task in board (All members)
router.post('/:boardId/tasks', validateUuidParam('boardId'), async (req, res, next) => {
  try {
    const validatedData = createTaskSchema.parse(req.body);
    const task = await TaskService.createTask(req.tenantId, req.params.boardId, req.user.id, validatedData);

    // Broadcast task creation after commit
    broadcastToBoard(req.tenantId, req.params.boardId, 'task:created', { task, version: task.version });

    res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

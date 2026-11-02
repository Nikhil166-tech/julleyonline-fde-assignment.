import { Router } from 'express';
import { TaskService } from '../services/task.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireTenantContext } from '../middlewares/tenant.middleware.js';
import { ValidationError } from '../errors/AppError.js';
import { prisma } from '../config/prisma.js';
import { broadcastToBoard } from '../socket/index.js';
import {
  updateTaskSchema,
  moveTaskSchema,
  deleteTaskSchema,
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

// GET /api/v1/tasks - Search or list tasks in active tenant workspace
router.get('/', async (req, res, next) => {
  try {
    const query = req.query.q || req.query.search || null;
    const boardId = req.query.boardId || null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

    const tasks = await TaskService.listOrSearchTasks(req.tenantId, {
      query,
      boardId,
      limit,
    });

    res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/tasks/:taskId - View task details
router.get('/:taskId', validateUuidParam('taskId'), async (req, res, next) => {
  try {
    const task = await TaskService.getTask(req.tenantId, req.params.taskId);
    res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/tasks/:taskId - Update task details with OCC version
router.put('/:taskId', validateUuidParam('taskId'), async (req, res, next) => {
  try {
    const validatedData = updateTaskSchema.parse(req.body);
    const updated = await TaskService.updateTask(req.tenantId, req.params.taskId, req.user.id, validatedData);

    // Broadcast real-time update only after successful commit
    broadcastToBoard(req.tenantId, updated.boardId, 'task:updated', {
      task: updated,
      version: updated.version,
    });

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tasks/:taskId/move - Move/reorder task with OCC version
router.post('/:taskId/move', validateUuidParam('taskId'), async (req, res, next) => {
  try {
    const validatedData = moveTaskSchema.parse(req.body);
    const moved = await TaskService.moveTask(req.tenantId, req.params.taskId, req.user.id, validatedData);

    // Broadcast real-time move only after successful commit
    broadcastToBoard(req.tenantId, moved.boardId, 'task:moved', {
      task: moved,
      targetColumnId: validatedData.targetColumnId,
      newPosition: validatedData.newPosition,
      version: moved.version,
    });

    res.status(200).json({
      success: true,
      data: moved,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/tasks/:taskId - Delete task with OCC version
router.delete('/:taskId', validateUuidParam('taskId'), async (req, res, next) => {
  try {
    const rawVersion = req.body?.version !== undefined ? req.body.version : req.query?.version;
    const { version } = deleteTaskSchema.parse({ version: rawVersion });

    const result = await TaskService.deleteTask(
      req.tenantId,
      req.params.taskId,
      req.user.id,
      req.membership.role,
      version
    );

    // Broadcast real-time deletion only after successful database commit
    broadcastToBoard(req.tenantId, result.boardId, 'task:deleted', {
      taskId: req.params.taskId,
      columnId: result.columnId,
      boardId: result.boardId,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

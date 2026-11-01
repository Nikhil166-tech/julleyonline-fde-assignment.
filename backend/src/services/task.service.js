import { prisma } from '../config/prisma.js';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../errors/AppError.js';
import { ActivityService } from './activity.service.js';

export class TaskService {
  /**
   * Create a new task in a specified column with contiguous integer position and version=1
   */
  static async createTask(tenantId, boardId, userId, data) {
    const { columnId, title, description, priority, dueDate, assignedToUserId } = data;

    // 1. Verify column belongs to board and active tenant
    const column = await prisma.column.findFirst({
      where: { id: columnId, tenantId, boardId },
    });

    if (!column) {
      throw new ValidationError('Target column not found on this board or tenant workspace');
    }

    // 2. If assignee specified, verify assignee belongs to this tenant workspace
    if (assignedToUserId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const assigneeMembership = await prisma.membership.findFirst({
        where: {
          userId: assignedToUserId,
          OR: [
            { tenantId },
            { orgId: tenant.orgId, tenantId: null, role: 'ORG_ADMIN' },
          ],
        },
      });

      if (!assigneeMembership) {
        throw new ValidationError('Assignee does not belong to this tenant workspace');
      }
    }

    // 3. Atomically determine contiguous position and insert task
    return prisma.$transaction(async (tx) => {
      const lastTask = await tx.task.findFirst({
        where: { columnId },
        orderBy: { position: 'desc' },
      });

      const nextPosition = lastTask !== null ? lastTask.position + 1 : 0;

      const task = await tx.task.create({
        data: {
          tenantId,
          boardId,
          columnId,
          createdByUserId: userId,
          assignedToUserId: assignedToUserId || null,
          title,
          description: description || null,
          priority: priority || 'MEDIUM',
          dueDate: dueDate ? new Date(dueDate) : null,
          position: nextPosition,
          version: 1,
        },
        include: {
          creator: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          assignee: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          column: {
            select: { id: true, name: true, position: true },
          },
        },
      });

      // 4. Log activity
      await ActivityService.log(tx, {
        tenantId,
        boardId,
        taskId: task.id,
        userId,
        action: 'TASK_CREATED',
        details: { title: task.title, columnId: task.columnId, position: task.position },
      });

      return task;
    });
  }

  /**
   * Retrieve task details with creator and assignee
   */
  static async getTask(tenantId, taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
      include: {
        creator: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        column: {
          select: { id: true, name: true, position: true },
        },
        board: {
          select: { id: true, name: true },
        },
      },
    });

    if (!task) {
      const existsElsewhere = await prisma.task.findUnique({ where: { id: taskId } });
      if (existsElsewhere) {
        throw new ForbiddenError('Access forbidden: Task belongs to another tenant workspace');
      }
      throw new NotFoundError('Task not found in this tenant workspace');
    }

    return task;
  }

  /**
   * Update task details using atomic optimistic concurrency control (version verification)
   */
  static async updateTask(tenantId, taskId, userId, data) {
    const { title, description, priority, dueDate, assignedToUserId, version } = data;

    // 1. Fetch current task to verify existence and boundary
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
      include: {
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        column: { select: { id: true, name: true } },
      },
    });

    if (!existingTask) {
      const existsElsewhere = await prisma.task.findUnique({ where: { id: taskId } });
      if (existsElsewhere) {
        throw new ForbiddenError('Access forbidden: Task belongs to another tenant workspace');
      }
      throw new NotFoundError('Task not found in this tenant workspace');
    }

    // 2. Check optimistic locking version
    if (existingTask.version !== version) {
      throw new ConflictError('Task has been modified by another collaborator. Please refresh.', {
        currentTask: existingTask,
      });
    }

    // 3. If assignee is being updated, verify assignee belongs to this tenant workspace
    if (assignedToUserId !== undefined && assignedToUserId !== null && assignedToUserId !== existingTask.assignedToUserId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const assigneeMembership = await prisma.membership.findFirst({
        where: {
          userId: assignedToUserId,
          OR: [
            { tenantId },
            { orgId: tenant.orgId, tenantId: null, role: 'ORG_ADMIN' },
          ],
        },
      });

      if (!assigneeMembership) {
        throw new ValidationError('Assignee does not belong to this tenant workspace');
      }
    }

    // 4. Atomic conditional update inside transaction
    return prisma.$transaction(async (tx) => {
      const updateResult = await tx.task.updateMany({
        where: {
          id: taskId,
          tenantId,
          version, // Atomic OCC version check
        },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
          ...(assignedToUserId !== undefined ? { assignedToUserId } : {}),
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        // Concurrent update occurred between check and execution
        const currentTask = await tx.task.findFirst({
          where: { id: taskId, tenantId },
          include: {
            creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
            assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
            column: { select: { id: true, name: true } },
          },
        });
        throw new ConflictError('Task has been modified by another collaborator. Please refresh.', {
          currentTask,
        });
      }

      const updatedTask = await tx.task.findFirst({
        where: { id: taskId, tenantId },
        include: {
          creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          column: { select: { id: true, name: true } },
        },
      });

      // 5. Log activity
      await ActivityService.log(tx, {
        tenantId,
        boardId: updatedTask.boardId,
        taskId: updatedTask.id,
        userId,
        action: 'TASK_UPDATED',
        details: {
          updatedFields: {
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(priority !== undefined ? { priority } : {}),
            ...(dueDate !== undefined ? { dueDate } : {}),
            ...(assignedToUserId !== undefined ? { assignedToUserId } : {}),
          },
          newVersion: updatedTask.version,
        },
      });

      return updatedTask;
    });
  }

  /**
   * Move task across or within columns with integer gap shifting and OCC version check
   */
  static async moveTask(tenantId, taskId, userId, { targetColumnId, newPosition, version }) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch task
      const task = await tx.task.findFirst({
        where: { id: taskId, tenantId },
        include: {
          creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          column: { select: { id: true, name: true } },
        },
      });

      if (!task) {
        const existsElsewhere = await tx.task.findUnique({ where: { id: taskId } });
        if (existsElsewhere) {
          throw new ForbiddenError('Access forbidden: Task belongs to another tenant workspace');
        }
        throw new NotFoundError('Task not found in this tenant workspace');
      }

      // 2. Verify target column belongs to the same board and tenant
      const targetColumn = await tx.column.findFirst({
        where: { id: targetColumnId, tenantId },
      });

      if (!targetColumn) {
        throw new ValidationError('Target column not found in this tenant workspace');
      }

      if (targetColumn.boardId !== task.boardId) {
        throw new ValidationError('Cannot move task to a column on a different board');
      }

      // 3. Optimistic locking verification
      if (task.version !== version) {
        throw new ConflictError('Task has been modified by another collaborator. Please refresh.', {
          currentTask: task,
        });
      }

      // 4. Lock column rows to serialize concurrent reorder operations
      if (task.columnId === targetColumnId) {
        await tx.$executeRaw`SELECT 1 FROM columns WHERE id = ${targetColumnId}::uuid FOR UPDATE`;
      } else {
        await tx.$executeRaw`
          SELECT 1 FROM columns 
          WHERE id IN (${task.columnId}::uuid, ${targetColumnId}::uuid)
          ORDER BY id
          FOR UPDATE
        `;
      }

      let clampedPos;

      // 5. Shift sibling tasks
      if (task.columnId === targetColumnId) {
        // Reordering within the same column
        const maxTask = await tx.task.findFirst({
          where: { columnId: targetColumnId },
          orderBy: { position: 'desc' },
        });
        const maxPos = maxTask ? maxTask.position : 0;
        clampedPos = Math.max(0, Math.min(newPosition, maxPos));

        if (clampedPos < task.position) {
          // Moving up: shift items between clampedPos and task.position - 1 down (+1)
          await tx.$executeRaw`
            UPDATE tasks
            SET position = position + 1, updated_at = NOW()
            WHERE column_id = ${targetColumnId}::uuid
              AND position >= ${clampedPos}
              AND position < ${task.position}
              AND id != ${task.id}::uuid
          `;
        } else if (clampedPos > task.position) {
          // Moving down: shift items between task.position + 1 and clampedPos up (-1)
          await tx.$executeRaw`
            UPDATE tasks
            SET position = position - 1, updated_at = NOW()
            WHERE column_id = ${targetColumnId}::uuid
              AND position <= ${clampedPos}
              AND position > ${task.position}
              AND id != ${task.id}::uuid
          `;
        }
      } else {
        // Moving across columns
        // Step A: Close the gap in source column
        await tx.$executeRaw`
          UPDATE tasks
          SET position = position - 1, updated_at = NOW()
          WHERE column_id = ${task.columnId}::uuid
            AND position > ${task.position}
        `;

        // Step B: Calculate clamped position in target column
        const maxTargetTask = await tx.task.findFirst({
          where: { columnId: targetColumnId },
          orderBy: { position: 'desc' },
        });
        const maxTargetPos = maxTargetTask !== null ? maxTargetTask.position + 1 : 0;
        clampedPos = Math.max(0, Math.min(newPosition, maxTargetPos));

        // Step C: Open gap in target column
        await tx.$executeRaw`
          UPDATE tasks
          SET position = position + 1, updated_at = NOW()
          WHERE column_id = ${targetColumnId}::uuid
            AND position >= ${clampedPos}
        `;
      }

      // 6. Atomic OCC update on the task
      const updateResult = await tx.task.updateMany({
        where: {
          id: taskId,
          tenantId,
          version, // OCC conditional check
        },
        data: {
          columnId: targetColumnId,
          position: clampedPos,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const currentTask = await tx.task.findFirst({
          where: { id: taskId, tenantId },
          include: {
            creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
            assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
            column: { select: { id: true, name: true } },
          },
        });
        throw new ConflictError('Task has been modified by another collaborator. Please refresh.', {
          currentTask,
        });
      }

      // 7. Fetch updated task with relations
      const movedTask = await tx.task.findFirst({
        where: { id: taskId, tenantId },
        include: {
          creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          column: { select: { id: true, name: true, position: true } },
        },
      });

      // 8. Log activity
      await ActivityService.log(tx, {
        tenantId,
        boardId: task.boardId,
        taskId: task.id,
        userId,
        action: 'TASK_MOVED',
        details: {
          fromColumnId: task.columnId,
          toColumnId: targetColumnId,
          fromPosition: task.position,
          toPosition: clampedPos,
          newVersion: movedTask.version,
        },
      });

      return movedTask;
    });
  }

  /**
   * Delete task with contiguous position gap closing and RBAC enforcement
   */
  static async deleteTask(tenantId, taskId, userId, userRole) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!task) {
      const existsElsewhere = await prisma.task.findUnique({ where: { id: taskId } });
      if (existsElsewhere) {
        throw new ForbiddenError('Access forbidden: Task belongs to another tenant workspace');
      }
      throw new NotFoundError('Task not found in this tenant workspace');
    }

    // Role check: Org Admin, Tenant Admin, or creator
    if (userRole !== 'ORG_ADMIN' && userRole !== 'TENANT_ADMIN' && task.createdByUserId !== userId) {
      throw new ForbiddenError('Only tenant administrators or the task creator can delete this task');
    }

    return prisma.$transaction(async (tx) => {
      await tx.task.delete({
        where: { id: taskId },
      });

      // Close contiguous gap in the column
      await tx.$executeRaw`
        UPDATE tasks
        SET position = position - 1, updated_at = NOW()
        WHERE column_id = ${task.columnId}::uuid
          AND position > ${task.position}
      `;

      await ActivityService.log(tx, {
        tenantId,
        boardId: task.boardId,
        taskId: null,
        userId,
        action: 'TASK_DELETED',
        details: { taskId: task.id, title: task.title, columnId: task.columnId, position: task.position },
      });

      return { success: true, message: 'Task deleted successfully' };
    });
  }
}

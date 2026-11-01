import { prisma } from '../config/prisma.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/AppError.js';
import { ActivityService } from './activity.service.js';

export class ColumnService {
  /**
   * Add a new column to a board with contiguous integer position
   */
  static async createColumn(tenantId, boardId, userId, { name }) {
    // 1. Verify board exists in active tenant
    const board = await prisma.board.findFirst({
      where: { id: boardId, tenantId },
    });

    if (!board) {
      throw new NotFoundError('Target board not found in this tenant workspace');
    }

    return prisma.$transaction(async (tx) => {
      // Find current highest position
      const lastColumn = await tx.column.findFirst({
        where: { boardId, tenantId },
        orderBy: { position: 'desc' },
      });

      const nextPosition = lastColumn !== null ? lastColumn.position + 1 : 0;

      const column = await tx.column.create({
        data: {
          tenantId,
          boardId,
          name,
          position: nextPosition,
        },
      });

      await ActivityService.log(tx, {
        tenantId,
        boardId,
        taskId: null,
        userId,
        action: 'COLUMN_CREATED',
        details: { columnId: column.id, name: column.name, position: column.position },
      });

      return column;
    });
  }

  /**
   * Rename a column
   */
  static async updateColumn(tenantId, columnId, userId, { name }) {
    const column = await prisma.column.findFirst({
      where: { id: columnId, tenantId },
    });

    if (!column) {
      throw new NotFoundError('Column not found in this tenant workspace');
    }

    return prisma.column.update({
      where: { id: columnId },
      data: { name },
    });
  }

  /**
   * Reorder a column within its board using atomic transaction-safe shifting
   */
  static async moveColumn(tenantId, columnId, userId, { newPosition }) {
    const column = await prisma.column.findFirst({
      where: { id: columnId, tenantId },
    });

    if (!column) {
      throw new NotFoundError('Column not found in this tenant workspace');
    }

    const oldPosition = column.position;
    if (oldPosition === newPosition) {
      return column; // No-op
    }

    return prisma.$transaction(async (tx) => {
      // Lock columns in this board to serialize concurrent reorders
      await tx.$executeRaw`SELECT 1 FROM columns WHERE board_id = ${column.boardId}::uuid FOR UPDATE`;

      const maxCol = await tx.column.findFirst({
        where: { boardId: column.boardId },
        orderBy: { position: 'desc' },
      });
      const maxPosition = maxCol ? maxCol.position : 0;
      const clampedPosition = Math.min(newPosition, maxPosition);

      if (clampedPosition < oldPosition) {
        // Shift columns right
        await tx.$executeRaw`
          UPDATE columns
          SET position = position + 1, updated_at = NOW()
          WHERE board_id = ${column.boardId}::uuid
            AND position >= ${clampedPosition}
            AND position < ${oldPosition}
            AND id != ${column.id}::uuid
        `;
      } else {
        // Shift columns left
        await tx.$executeRaw`
          UPDATE columns
          SET position = position - 1, updated_at = NOW()
          WHERE board_id = ${column.boardId}::uuid
            AND position <= ${clampedPosition}
            AND position > ${oldPosition}
            AND id != ${column.id}::uuid
        `;
      }

      const updated = await tx.column.update({
        where: { id: column.id },
        data: { position: clampedPosition },
      });

      return updated;
    });
  }

  /**
   * Delete a column with explicit non-empty policy
   */
  static async deleteColumn(tenantId, columnId, userId) {
    const column = await prisma.column.findFirst({
      where: { id: columnId, tenantId },
    });

    if (!column) {
      throw new NotFoundError('Column not found in this tenant workspace');
    }

    return prisma.$transaction(async (tx) => {
      // 1. Mandatory Policy: Check if column contains any tasks
      const taskCount = await tx.task.count({
        where: { columnId },
      });

      if (taskCount > 0) {
        throw new ValidationError(
          `Cannot delete column containing ${taskCount} task(s). Move or delete tasks before deleting this column.`
        );
      }

      // 2. Delete empty column
      await tx.column.delete({
        where: { id: columnId },
      });

      // 3. Shift subsequent columns left to maintain contiguous integer sequence
      await tx.$executeRaw`
        UPDATE columns
        SET position = position - 1, updated_at = NOW()
        WHERE board_id = ${column.boardId}::uuid
          AND position > ${column.position}
      `;

      await ActivityService.log(tx, {
        tenantId,
        boardId: column.boardId,
        taskId: null,
        userId,
        action: 'COLUMN_DELETED',
        details: { columnName: column.name, deletedPosition: column.position },
      });

      return { success: true, message: 'Column deleted successfully' };
    });
  }
}

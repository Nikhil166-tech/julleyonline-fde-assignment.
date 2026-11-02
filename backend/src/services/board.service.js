import { prisma } from '../config/prisma.js';
import { NotFoundError, ForbiddenError } from '../errors/AppError.js';
import { ActivityService } from './activity.service.js';

export class BoardService {
  /**
   * List all boards in the active tenant workspace, optionally filtered by query
   */
  static async listBoards(tenantId, query = null) {
    const where = { tenantId };

    if (query && typeof query === 'string' && query.trim()) {
      const q = query.trim();
      const orConditions = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
        orConditions.push({ id: q });
      }
      where.OR = orConditions;
    }

    const boards = await prisma.board.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { columns: true, tasks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return boards.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      tenantId: b.tenantId,
      createdBy: b.createdBy,
      columnCount: b._count.columns,
      taskCount: b._count.tasks,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  /**
   * Create a new board in the tenant workspace with default columns
   */
  static async createBoard(tenantId, userId, { name, description }) {
    return prisma.$transaction(async (tx) => {
      // 1. Create board
      const board = await tx.board.create({
        data: {
          tenantId,
          name,
          description: description || null,
          createdByUserId: userId,
        },
      });

      // 2. Initialize default workflow columns (0: Backlog, 1: In Progress, 2: Done)
      const defaultColumns = ['Backlog', 'In Progress', 'Done'];
      for (let i = 0; i < defaultColumns.length; i++) {
        await tx.column.create({
          data: {
            tenantId,
            boardId: board.id,
            name: defaultColumns[i],
            position: i,
          },
        });
      }

      // 3. Log activity
      await ActivityService.log(tx, {
        tenantId,
        boardId: board.id,
        taskId: null,
        userId,
        action: 'BOARD_CREATED',
        details: { boardName: board.name },
      });

      return board;
    });
  }

  /**
   * Retrieve authoritative board snapshot with columns and ordered tasks
   */
  static async getBoard(tenantId, boardId) {
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        tenantId, // Non-negotiable tenant boundary
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: { position: 'asc' },
              include: {
                creator: {
                  select: { id: true, name: true, email: true, avatarUrl: true },
                },
                assignee: {
                  select: { id: true, name: true, email: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
    });

    if (!board) {
      // Check if board exists under a different tenant to avoid information leakage
      const existsElsewhere = await prisma.board.findUnique({ where: { id: boardId } });
      if (existsElsewhere) {
        throw new ForbiddenError('Access forbidden: Board belongs to another tenant workspace');
      }
      throw new NotFoundError('Board not found');
    }

    return board;
  }

  /**
   * Update board title and description
   */
  static async updateBoard(tenantId, boardId, userId, { name, description }) {
    const board = await prisma.board.findFirst({
      where: { id: boardId, tenantId },
    });

    if (!board) {
      throw new NotFoundError('Board not found in this tenant');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({
        where: { id: boardId },
        data: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });

      await ActivityService.log(tx, {
        tenantId,
        boardId,
        taskId: null,
        userId,
        action: 'BOARD_UPDATED',
        details: { updatedFields: { name, description } },
      });

      return updated;
    });
  }

  /**
   * Delete board and cascade to columns, tasks, and activity logs
   */
  static async deleteBoard(tenantId, boardId, userId) {
    const board = await prisma.board.findFirst({
      where: { id: boardId, tenantId },
    });

    if (!board) {
      throw new NotFoundError('Board not found in this tenant');
    }

    await prisma.board.delete({
      where: { id: boardId },
    });

    return { success: true, message: 'Board and all associated columns and tasks deleted successfully' };
  }
}

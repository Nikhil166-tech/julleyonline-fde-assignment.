import { prisma } from '../config/prisma.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors/AppError.js';

const MAX_CONTEXT_TASKS = 100;
const MAX_CONTEXT_ACTIVITIES = 30;

export class AiContextService {
  /**
   * Builds an authorized, sanitized, bounded data context for the AI Assistant.
   * Strictly enforces tenant boundary and deterministic aggregations.
   *
   * @param {string} tenantId - Active authorized tenant UUID
   * @param {string|null} [boardId=null] - Optional board UUID to focus context
   * @returns {Promise<object>} Sanitized context payload
   */
  static async getSanitizedContext(tenantId, boardId = null) {
    if (!tenantId) {
      throw new ValidationError('tenantId is required to construct AI context');
    }

    // 1. Resolve and verify active tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, orgId: true },
    });

    if (!tenant) {
      throw new NotFoundError('Target tenant workspace not found');
    }

    let targetBoard = null;
    if (boardId) {
      targetBoard = await prisma.board.findUnique({
        where: { id: boardId },
        select: { id: true, name: true, tenantId: true },
      });

      if (!targetBoard) {
        throw new NotFoundError('Specified board not found');
      }

      if (targetBoard.tenantId !== tenantId) {
        throw new ForbiddenError('Access forbidden: Board belongs to another tenant workspace');
      }
    }

    // 2. Fetch tenant boards metadata (id, name)
    const boards = await prisma.board.findMany({
      where: { tenantId },
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: 'asc' },
    });

    // 3. Fetch columns for the scoped board(s)
    const columns = await prisma.column.findMany({
      where: {
        tenantId,
        ...(boardId ? { boardId } : {}),
      },
      select: { id: true, boardId: true, name: true, position: true },
      orderBy: [{ boardId: 'asc' }, { position: 'asc' }],
    });

    // 4. Query total task count deterministically across entire query
    const taskWhere = {
      tenantId,
      ...(boardId ? { boardId } : {}),
    };

    const totalTasksCount = await prisma.task.count({ where: taskWhere });

    // 5. Fetch bounded list of tasks with sanitized relations
    const rawTasks = await prisma.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        boardId: true,
        columnId: true,
        title: true,
        description: true,
        priority: true,
        dueDate: true,
        position: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        column: {
          select: { name: true },
        },
        assignee: {
          select: { id: true, name: true }, // Strictly NO email or password hashes
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { position: 'asc' }],
      take: MAX_CONTEXT_TASKS,
    });

    const now = new Date();

    // Sanitize task records and truncate description to conserve LLM context tokens
    const sanitizedTasks = rawTasks.map((t) => ({
      id: t.id,
      boardId: t.boardId,
      columnId: t.columnId,
      columnName: t.column?.name || 'Unknown',
      title: t.title,
      description: t.description ? t.description.slice(0, 300) : '',
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      position: t.position,
      assigneeName: t.assignee?.name || null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    // 6. Compute deterministic statistical metrics
    const byColumn = {};
    const byPriority = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
    let overdueCount = 0;
    let completedCount = 0;
    let unassignedCount = 0;

    for (const t of sanitizedTasks) {
      byColumn[t.columnName] = (byColumn[t.columnName] || 0) + 1;
      if (byPriority[t.priority] !== undefined) {
        byPriority[t.priority]++;
      }
      if (!t.assigneeName) {
        unassignedCount++;
      }

      const isCompleted = /done|completed|shipped|finished/i.test(t.columnName);
      if (isCompleted) {
        completedCount++;
      }

      if (t.dueDate) {
        const dueTime = new Date(t.dueDate);
        if (dueTime < now && !isCompleted) {
          overdueCount++;
        }
      }
    }

    // 7. Fetch bounded recent activity logs
    const activityWhere = {
      tenantId,
      ...(boardId ? { boardId } : {}),
    };

    const rawActivities = await prisma.activityLog.findMany({
      where: activityWhere,
      select: {
        id: true,
        boardId: true,
        taskId: true,
        action: true,
        details: true,
        createdAt: true,
        user: {
          select: { name: true }, // Strictly NO email or credentials
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_CONTEXT_ACTIVITIES,
    });

    const sanitizedActivities = rawActivities.map((a) => ({
      id: a.id,
      boardId: a.boardId,
      taskId: a.taskId,
      action: a.action,
      details: a.details,
      actorName: a.user?.name || 'Collaborator',
      createdAt: a.createdAt.toISOString(),
    }));

    // 8. Return complete, strictly sanitized workspace context
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      boardId: targetBoard ? targetBoard.id : null,
      boardName: targetBoard ? targetBoard.name : null,
      currentTime: now.toISOString(),
      isTruncated: totalTasksCount > sanitizedTasks.length,
      metrics: {
        totalTasks: totalTasksCount,
        sampledTasks: sanitizedTasks.length,
        completedTasks: completedCount,
        pendingTasks: Math.max(0, totalTasksCount - completedCount),
        overdueTasks: overdueCount,
        unassignedTasks: unassignedCount,
        byColumn,
        byPriority,
      },
      boards: boards.map((b) => ({ id: b.id, name: b.name })),
      columns: columns.map((c) => ({ id: c.id, boardId: c.boardId, name: c.name, position: c.position })),
      tasks: sanitizedTasks,
      activities: sanitizedActivities,
    };
  }
}

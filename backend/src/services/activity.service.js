import { prisma } from '../config/prisma.js';

export class ActivityService {
  /**
   * Record an activity log entry inside an existing transaction or standalone
   */
  static async log(clientOrTx, { tenantId, boardId, taskId = null, userId, action, details = {} }) {
    const db = clientOrTx || prisma;
    return db.activityLog.create({
      data: {
        tenantId,
        boardId,
        taskId,
        userId,
        action,
        details,
      },
    });
  }

  /**
   * Fetch recent activity logs for a specific board within the authorized tenant
   */
  static async getBoardActivities(tenantId, boardId, limit = 50) {
    return prisma.activityLog.findMany({
      where: {
        tenantId,
        boardId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  /**
   * Fetch recent activity logs across an entire tenant workspace, with optional board filtering
   */
  static async getTenantActivities(tenantId, { boardId, limit = 50 } = {}) {
    const where = { tenantId };
    if (boardId) {
      where.boardId = boardId;
    }
    return prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 100),
    });
  }
}

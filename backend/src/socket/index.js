import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';

let ioInstance = null;

// Room Presence Tracker:
// Map<roomKey, Map<userId, { user: { id, name, email, avatarUrl }, socketIds: Set<string> }>>
const presenceMap = new Map();

// Socket to Rooms mapping:
// Map<socketId, Set<roomKey>>
const socketRoomsMap = new Map();

export function getRoomKey(tenantId, boardId) {
  return `tenant:${tenantId}:board:${boardId}`;
}

export function getTenantRoomKey(tenantId) {
  return `tenant:${tenantId}`;
}

export function getActiveUsers(roomKey) {
  const roomPresence = presenceMap.get(roomKey);
  if (!roomPresence) return [];
  return Array.from(roomPresence.values()).map((entry) => entry.user);
}

export function initSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 10000,
    pingInterval: 10000,
  });

  ioInstance = io;

  // 1. Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const token =
        socket.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);

      if (!token) {
        return next(new Error('Authentication error: JWT token is required'));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, config.jwtSecret);
      } catch (jwtErr) {
        return next(new Error(`Authentication error: Invalid or expired token (${jwtErr.message})`));
      }

      const userId = decoded.userId || decoded.id;
      if (!userId) {
        return next(new Error('Authentication error: Invalid token payload'));
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, avatarUrl: true },
      });

      if (!user) {
        return next(new Error('Authentication error: User account not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error(`Authentication error: ${err.message}`));
    }
  });

  // 2. Connection Handler
  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socketRoomsMap.set(socket.id, new Set());

    // Join Board Room with Database Authorization
    socket.on('join:board', async (payload, callback) => {
      try {
        const { tenantId, boardId } = payload || {};
        if (!tenantId || !boardId) {
          const errPayload = { error: 'Both tenantId and boardId are required' };
          socket.emit('room:error', errPayload);
          if (typeof callback === 'function') callback(errPayload);
          return;
        }

        // Verify board exists and belongs to active tenant
        const board = await prisma.board.findFirst({
          where: { id: boardId, tenantId },
          include: { tenant: { select: { orgId: true } } },
        });

        if (!board) {
          const errPayload = {
            error: 'Target board does not exist or does not belong to the specified tenant',
            code: 'FORBIDDEN',
          };
          socket.emit('error:unauthorized', errPayload);
          if (typeof callback === 'function') callback(errPayload);
          return;
        }

        // Verify user has authorized membership in this tenant or is Org Admin
        const membership = await prisma.membership.findFirst({
          where: {
            userId,
            OR: [
              { tenantId },
              { orgId: board.tenant.orgId, tenantId: null, role: 'ORG_ADMIN' },
            ],
          },
        });

        if (!membership) {
          const errPayload = {
            error: 'Access forbidden: User is not authorized to join this board room',
            code: 'FORBIDDEN',
          };
          socket.emit('error:unauthorized', errPayload);
          if (typeof callback === 'function') callback(errPayload);
          return;
        }

        const roomKey = getRoomKey(tenantId, boardId);
        socket.join(roomKey);
        socketRoomsMap.get(socket.id)?.add(roomKey);

        // Update Presence Manager
        if (!presenceMap.has(roomKey)) {
          presenceMap.set(roomKey, new Map());
        }
        const roomPresence = presenceMap.get(roomKey);

        if (!roomPresence.has(userId)) {
          roomPresence.set(userId, {
            user: socket.user,
            socketIds: new Set([socket.id]),
          });
        } else {
          roomPresence.get(userId).socketIds.add(socket.id);
        }

        const activeUsers = getActiveUsers(roomKey);

        // Acknowledge to joining socket
        const joinPayload = {
          success: true,
          room: roomKey,
          boardId,
          tenantId,
          activeUsers,
        };
        socket.emit('room:joined', joinPayload);
        if (typeof callback === 'function') callback(joinPayload);

        // Broadcast presence update to room peers
        io.to(roomKey).emit('presence:sync', {
          boardId,
          tenantId,
          activeUsers,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[Socket] Error in join:board:', err);
        socket.emit('room:error', { error: err.message });
      }
    });

    // Leave Board Room
    socket.on('leave:board', ({ tenantId, boardId }) => {
      if (!tenantId || !boardId) return;
      const roomKey = getRoomKey(tenantId, boardId);
      socket.leave(roomKey);
      socketRoomsMap.get(socket.id)?.delete(roomKey);

      handleLeavePresence(roomKey, userId, socket.id, io);
    });

    // Join Tenant Room with Database Authorization
    socket.on('join:tenant', async (payload, callback) => {
      try {
        const { tenantId } = payload || {};
        if (!tenantId) {
          const errPayload = { error: 'tenantId is required' };
          socket.emit('room:error', errPayload);
          if (typeof callback === 'function') callback(errPayload);
          return;
        }

        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, orgId: true },
        });

        if (!tenant) {
          const errPayload = { error: 'Target tenant workspace does not exist', code: 'NOT_FOUND' };
          socket.emit('error:unauthorized', errPayload);
          if (typeof callback === 'function') callback(errPayload);
          return;
        }

        const membership = await prisma.membership.findFirst({
          where: {
            userId,
            OR: [
              { tenantId },
              { orgId: tenant.orgId, tenantId: null, role: 'ORG_ADMIN' },
            ],
          },
        });

        if (!membership) {
          const errPayload = {
            error: 'Access forbidden: User is not authorized to join this tenant workspace',
            code: 'FORBIDDEN',
          };
          socket.emit('error:unauthorized', errPayload);
          if (typeof callback === 'function') callback(errPayload);
          return;
        }

        const roomKey = getTenantRoomKey(tenantId);
        socket.join(roomKey);
        socketRoomsMap.get(socket.id)?.add(roomKey);

        if (!presenceMap.has(roomKey)) {
          presenceMap.set(roomKey, new Map());
        }
        const roomPresence = presenceMap.get(roomKey);

        if (!roomPresence.has(userId)) {
          roomPresence.set(userId, {
            user: socket.user,
            socketIds: new Set([socket.id]),
          });
        } else {
          roomPresence.get(userId).socketIds.add(socket.id);
        }

        const activeUsers = getActiveUsers(roomKey);

        const joinPayload = {
          success: true,
          room: roomKey,
          tenantId,
          activeUsers,
        };
        socket.emit('tenant:joined', joinPayload);
        if (typeof callback === 'function') callback(joinPayload);

        io.to(roomKey).emit('tenant:presence:sync', {
          tenantId,
          activeUsers,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[Socket] Error in join:tenant:', err);
        socket.emit('room:error', { error: err.message });
      }
    });

    // Leave Tenant Room
    socket.on('leave:tenant', ({ tenantId }) => {
      if (!tenantId) return;
      const roomKey = getTenantRoomKey(tenantId);
      socket.leave(roomKey);
      socketRoomsMap.get(socket.id)?.delete(roomKey);

      handleLeavePresence(roomKey, userId, socket.id, io);
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
      const rooms = socketRoomsMap.get(socket.id) || new Set();
      for (const roomKey of rooms) {
        handleLeavePresence(roomKey, userId, socket.id, io);
      }
      socketRoomsMap.delete(socket.id);
    });
  });

  return io;
}

function handleLeavePresence(roomKey, userId, socketId, io) {
  const roomPresence = presenceMap.get(roomKey);
  if (!roomPresence) return;

  const userEntry = roomPresence.get(userId);
  if (userEntry) {
    userEntry.socketIds.delete(socketId);
    if (userEntry.socketIds.size === 0) {
      roomPresence.delete(userId);
    }
  }

  if (roomPresence.size === 0) {
    presenceMap.delete(roomKey);
  } else {
    const parts = roomKey.split(':');
    const activeUsers = getActiveUsers(roomKey);

    if (parts.length === 4) {
      // Board room: "tenant:<tenantId>:board:<boardId>"
      const tenantId = parts[1];
      const boardId = parts[3];
      io.to(roomKey).emit('presence:sync', {
        boardId,
        tenantId,
        activeUsers,
        timestamp: new Date().toISOString(),
      });
    } else if (parts.length === 2) {
      // Tenant workspace room: "tenant:<tenantId>"
      const tenantId = parts[1];
      io.to(roomKey).emit('tenant:presence:sync', {
        tenantId,
        activeUsers,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export function getIO() {
  return ioInstance;
}

/**
 * Broadcast an event to a tenant-scoped board room AFTER database commit.
 */
export function broadcastToBoard(tenantId, boardId, event, data) {
  if (!ioInstance) return;
  const roomKey = getRoomKey(tenantId, boardId);
  const payload = {
    eventId: crypto.randomUUID(),
    type: event,
    boardId,
    tenantId,
    timestamp: new Date().toISOString(),
    ...data,
  };
  ioInstance.to(roomKey).emit(event, payload);
}

/**
 * Broadcast an event to a tenant workspace room AFTER database commit.
 */
export function broadcastToTenant(tenantId, event, data) {
  if (!ioInstance) return;
  const roomKey = getTenantRoomKey(tenantId);
  const payload = {
    eventId: crypto.randomUUID(),
    type: event,
    tenantId,
    timestamp: new Date().toISOString(),
    ...data,
  };
  ioInstance.to(roomKey).emit(event, payload);
}

/**
 * Revoke a user's active sockets when membership is removed.
 */
export async function revokeUserFromTenant(tenantId, userId) {
  if (!ioInstance) return;
  const sockets = await ioInstance.fetchSockets();
  for (const s of sockets) {
    if (s.user?.id === userId) {
      const rooms = socketRoomsMap.get(s.id) || new Set();
      for (const roomKey of rooms) {
        if (roomKey === `tenant:${tenantId}` || roomKey.startsWith(`tenant:${tenantId}:`)) {
          s.leave(roomKey);
          s.emit('room:kicked', { tenantId, message: 'Your membership in this workspace has been revoked.' });
          handleLeavePresence(roomKey, userId, s.id, ioInstance);
        }
      }
    }
  }
}

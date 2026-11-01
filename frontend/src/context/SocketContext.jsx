import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, activeTenant, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected' | 'reconnecting' | 'disconnected'
  const [activeUsers, setActiveUsers] = useState([]);
  const activeRoomRef = useRef(null);
  const processedEventsRef = useRef(new Set());
  const reconnectListenersRef = useRef(new Set());

  // Connect / Disconnect socket when authentication state changes
  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnectionStatus('disconnected');
        setActiveUsers([]);
      }
      return;
    }

    // Connect via origin (Vite proxy forwards /socket.io to active backend port)
    const newSocket = io(window.location.origin, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    setSocket(newSocket);
    window.__socketInstance = newSocket;
    setConnectionStatus('reconnecting');

    newSocket.on('connect', () => {
      setConnectionStatus('connected');

      // If already tracking an active board room, re-join on reconnect
      if (activeRoomRef.current) {
        const { tenantId, boardId } = activeRoomRef.current;
        newSocket.emit('join:board', { tenantId, boardId }, (res) => {
          if (res?.activeUsers) {
            setActiveUsers(res.activeUsers);
          }
        });

        // Notify subscribers to refetch authoritative snapshot
        for (const cb of reconnectListenersRef.current) {
          try {
            cb();
          } catch (err) {
            console.error('[Socket] Reconnect callback error:', err);
          }
        }
      }
    });

    newSocket.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    newSocket.on('disconnect', (reason) => {
      setConnectionStatus('disconnected');
      if (reason === 'io server disconnect') {
        // the server forcefully disconnected the socket (e.g. membership revoked)
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
      setConnectionStatus('disconnected');
    });

    newSocket.on('presence:sync', (payload) => {
      if (payload?.activeUsers) {
        setActiveUsers(payload.activeUsers);
      }
    });

    newSocket.on('room:kicked', (payload) => {
      console.warn('[Socket] Kicked from room:', payload.message);
      setActiveUsers([]);
      activeRoomRef.current = null;
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setConnectionStatus('disconnected');
      setActiveUsers([]);
    };
  }, [token, isAuthenticated]);

  // Join a board room
  const joinBoard = useCallback(
    (tenantId, boardId) => {
      if (!socket || !tenantId || !boardId) return;

      activeRoomRef.current = { tenantId, boardId };

      if (socket.connected) {
        socket.emit('join:board', { tenantId, boardId }, (res) => {
          if (res?.activeUsers) {
            setActiveUsers(res.activeUsers);
          }
        });
      }
    },
    [socket]
  );

  // Leave a board room
  const leaveBoard = useCallback(
    (tenantId, boardId) => {
      if (!socket || !tenantId || !boardId) return;
      socket.emit('leave:board', { tenantId, boardId });
      if (activeRoomRef.current?.boardId === boardId) {
        activeRoomRef.current = null;
        setActiveUsers([]);
      }
    },
    [socket]
  );

  // Subscribe to reconnect resync
  const onReconnectResync = useCallback((callback) => {
    reconnectListenersRef.current.add(callback);
    return () => {
      reconnectListenersRef.current.delete(callback);
    };
  }, []);

  // Utility to check and register eventId for idempotency
  const isDuplicateEvent = useCallback((eventId) => {
    if (!eventId) return false;
    if (processedEventsRef.current.has(eventId)) {
      return true;
    }
    processedEventsRef.current.add(eventId);
    // Keep max 200 event IDs
    if (processedEventsRef.current.size > 200) {
      const first = processedEventsRef.current.values().next().value;
      processedEventsRef.current.delete(first);
    }
    return false;
  }, []);

  const value = {
    socket,
    connectionStatus,
    activeUsers,
    joinBoard,
    leaveBoard,
    onReconnectResync,
    isDuplicateEvent,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

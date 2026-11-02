import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  Star,
  Share2,
  Plus,
  ChevronDown,
  LayoutGrid,
  List,
  Calendar,
  History,
  Settings as SettingsIcon,
  AlertCircle,
  FolderPlus,
  RefreshCw,
  Undo2,
  Redo2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { KanbanColumn } from './KanbanColumn';
import { SortableTaskCard } from './SortableTaskCard';
import { TaskDetailsDrawer } from './TaskDetailsDrawer';
import { CreateTaskModal } from '../../components/modals/CreateTaskModal';
import { CreateColumnModal } from '../../components/modals/CreateColumnModal';
import { CreateBoardModal } from '../../components/modals/CreateBoardModal';
import { ConflictModal } from '../../components/modals/ConflictModal';
import { BoardSelector } from '../../components/layout/BoardSelector';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useUndoRedo } from '../../context/UndoRedoContext';
import { api } from '../../lib/api/client';
import { useSearchParams } from 'react-router-dom';

export function DashboardPage() {
  const { activeTenant, effectiveRole, user } = useAuth();
  const { socket, joinBoard, leaveBoard, onReconnectResync, isDuplicateEvent } = useSocket();
  const { undo, redo, canUndo, canRedo, recordAction, isExecuting, undoError } = useUndoRedo();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlBoardId = searchParams.get('boardId');
  const [boards, setBoards] = useState([]);
  const [currentBoardId, setCurrentBoardId] = useState(urlBoardId || null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Interactive Modals & Drawer State
  const [selectedTask, setSelectedTask] = useState(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [defaultColumnId, setDefaultColumnId] = useState(null);
  const [isCreateColumnOpen, setIsCreateColumnOpen] = useState(false);
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const [conflictDetails, setConflictDetails] = useState(null);

  // Active dragged task for DndKit overlay
  const [activeTask, setActiveTask] = useState(null);

  // Drag Sensors with 5px distance constraint to allow card clicks
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Helper to get current task from board state for Undo/Redo OCC
  const getCurrentTask = useCallback(
    (taskId) => {
      if (!board?.columns) return null;
      for (const col of board.columns) {
        const found = col.tasks?.find((t) => t.id === taskId);
        if (found) return found;
      }
      return null;
    },
    [board]
  );

  // Undo / Redo keyboard shortcuts (Ctrl+Z / Ctrl+Y / Cmd+Z / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          if (canRedo && !isExecuting) {
            redo(getCurrentTask).catch((err) => {
              if (err.statusCode === 409) setConflictDetails(err.details);
            });
          }
        } else {
          e.preventDefault();
          if (canUndo && !isExecuting) {
            undo(getCurrentTask).catch((err) => {
              if (err.statusCode === 409) setConflictDetails(err.details);
            });
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo && !isExecuting) {
          redo(getCurrentTask).catch((err) => {
            if (err.statusCode === 409) setConflictDetails(err.details);
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, isExecuting, undo, redo, getCurrentTask]);

  // 1. Fetch available boards for active tenant
  const fetchTenantBoards = useCallback(
    async (preferredBoardId = null) => {
      if (!activeTenant?.id) return;
      try {
        setLoading(true);
        setError('');
        const res = await api.get('/boards');
        if (res?.data) {
          setBoards(res.data);
          if (res.data.length > 0) {
            const target =
              (preferredBoardId && res.data.find((b) => b.id === preferredBoardId)) ||
              (urlBoardId && res.data.find((b) => b.id === urlBoardId)) ||
              (currentBoardId && res.data.find((b) => b.id === currentBoardId)) ||
              res.data[0];

            setCurrentBoardId(target.id);
            setSearchParams({ boardId: target.id }, { replace: true });
          } else {
            setCurrentBoardId(null);
            setBoard(null);
            setSearchParams({}, { replace: true });
          }
        }
      } catch (err) {
        console.error('Failed to load boards:', err);
        setError(err.message || 'Failed to load boards');
      } finally {
        setLoading(false);
      }
    },
    [activeTenant?.id, currentBoardId, urlBoardId, setSearchParams]
  );

  // Clear stale boards immediately when switching tenant to prevent cross-tenant UI bleed
  useEffect(() => {
    setBoards([]);
    setBoard(null);
    setCurrentBoardId(null);
    setSelectedTask(null);
    setConflictDetails(null);
    fetchTenantBoards();
  }, [activeTenant?.id]);

  useEffect(() => {
    if (urlBoardId && urlBoardId !== currentBoardId && boards.some((b) => b.id === urlBoardId)) {
      setCurrentBoardId(urlBoardId);
    }
  }, [urlBoardId, boards]);

  // Explicit board selection from dropdown
  const handleSelectBoard = (newBoardId) => {
    if (newBoardId === currentBoardId) return;
    setCurrentBoardId(newBoardId);
    setSelectedTask(null);
    setSearchParams({ boardId: newBoardId }, { replace: true });
    fetchBoardSnapshot(newBoardId);
  };

  const boardSnapshotSeq = useRef(0);

  // 2. Fetch authoritative snapshot of selected board
  const fetchBoardSnapshot = useCallback(
    async (boardId) => {
      if (!boardId) return;
      const seq = ++boardSnapshotSeq.current;
      try {
        const res = await api.get(`/boards/${boardId}`);
        if (seq !== boardSnapshotSeq.current) return; // Stale response discarded
        if (res?.data) {
          setBoard(res.data);
          // If a task is selected in the drawer, sync its data with fresh snapshot
          if (selectedTask) {
            for (const col of res.data.columns || []) {
              const updated = col.tasks?.find((t) => t.id === selectedTask.id);
              if (updated) {
                setSelectedTask(updated);
                break;
              }
            }
          }
        }
      } catch (err) {
        if (seq === boardSnapshotSeq.current) {
          console.error('Failed to load board snapshot:', err);
          setError(err.message || 'Failed to load board snapshot');
        }
      }
    },
    [selectedTask]
  );

  useEffect(() => {
    if (currentBoardId) {
      fetchBoardSnapshot(currentBoardId);
    }
  }, [currentBoardId]);

  // Real-Time Room Join & Leave with Socket.IO
  useEffect(() => {
    if (activeTenant?.id && currentBoardId) {
      joinBoard(activeTenant.id, currentBoardId);
      return () => {
        leaveBoard(activeTenant.id, currentBoardId);
      };
    }
  }, [activeTenant?.id, currentBoardId, joinBoard, leaveBoard]);

  // Reconnection Resync: Refetch authoritative board snapshot
  useEffect(() => {
    const unsubscribe = onReconnectResync(() => {
      if (currentBoardId) {
        fetchBoardSnapshot(currentBoardId);
      }
    });
    return unsubscribe;
  }, [onReconnectResync, currentBoardId, fetchBoardSnapshot]);

  // Real-Time Broadcast Subscriptions
  useEffect(() => {
    if (!socket || !currentBoardId) return;

    const handleTaskCreatedSocket = (payload) => {
      if (!payload?.task || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      setBoard((prev) => {
        if (!prev) return prev;
        const exists = prev.columns?.some((c) =>
          c.tasks?.some((t) => t.id === payload.task.id)
        );
        if (exists) {
          return {
            ...prev,
            columns: prev.columns.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) => (t.id === payload.task.id ? payload.task : t)),
            })),
          };
        }
        return {
          ...prev,
          columns: prev.columns.map((col) => {
            if (col.id === payload.task.columnId) {
              const tasks = [...(col.tasks || []), payload.task].sort(
                (a, b) => a.position - b.position
              );
              return { ...col, tasks };
            }
            return col;
          }),
        };
      });
    };

    const handleTaskUpdatedSocket = (payload) => {
      if (!payload?.task || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) => ({
            ...col,
            tasks: (col.tasks || []).map((t) =>
              t.id === payload.task.id ? payload.task : t
            ),
          })),
        };
      });

      setSelectedTask((prevSelected) =>
        prevSelected && prevSelected.id === payload.task.id ? payload.task : prevSelected
      );
    };

    const handleTaskMovedSocket = (payload) => {
      if (!payload?.task || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      const movedTask = payload.task;
      const targetColId = payload.targetColumnId || movedTask.columnId;

      setBoard((prev) => {
        if (!prev) return prev;

        // Check if incoming version is older than existing version
        let existingVersion = 0;
        for (const col of prev.columns || []) {
          const found = col.tasks?.find((t) => t.id === movedTask.id);
          if (found) {
            existingVersion = found.version;
            break;
          }
        }
        if (existingVersion && movedTask.version < existingVersion) {
          return prev; // Ignore stale socket event
        }

        const cleanColumns = prev.columns.map((c) => ({
          ...c,
          tasks: (c.tasks || []).filter((t) => t.id !== movedTask.id),
        }));

        return {
          ...prev,
          columns: cleanColumns.map((c) => {
            if (c.id === targetColId) {
              const updatedTasks = [...c.tasks, movedTask].sort(
                (a, b) => a.position - b.position
              );
              return { ...c, tasks: updatedTasks };
            }
            return c;
          }),
        };
      });

      setSelectedTask((prevSelected) =>
        prevSelected && prevSelected.id === movedTask.id ? movedTask : prevSelected
      );

      // Reconcile all sibling positions authoritatively in background
      fetchBoardSnapshot(currentBoardId);
    };

    const handleTaskDeletedSocket = (payload) => {
      if (!payload?.taskId || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) => ({
            ...col,
            tasks: (col.tasks || []).filter((t) => t.id !== payload.taskId),
          })),
        };
      });

      setSelectedTask((prevSelected) =>
        prevSelected && prevSelected.id === payload.taskId ? null : prevSelected
      );
    };

    const handleColumnCreatedSocket = (payload) => {
      if (!payload?.column || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      setBoard((prev) => {
        if (!prev) return prev;
        if (prev.columns.some((c) => c.id === payload.column.id)) return prev;
        return {
          ...prev,
          columns: [...prev.columns, { ...payload.column, tasks: [] }].sort(
            (a, b) => a.position - b.position
          ),
        };
      });
    };

    const handleColumnMovedSocket = (payload) => {
      if (!payload?.column || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      setBoard((prev) => {
        if (!prev) return prev;
        const exists = prev.columns.some((c) => c.id === payload.column.id);
        if (!exists) return prev;
        return {
          ...prev,
          columns: prev.columns
            .map((c) => (c.id === payload.column.id ? { ...c, position: payload.column.position } : c))
            .sort((a, b) => a.position - b.position),
        };
      });

      fetchBoardSnapshot(currentBoardId);
    };

    const handleColumnUpdatedSocket = (payload) => {
      if (!payload?.column || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((c) =>
            c.id === payload.column.id ? { ...c, name: payload.column.name } : c
          ),
        };
      });
    };

    const handleColumnDeletedSocket = (payload) => {
      if (!payload?.columnId || isDuplicateEvent(payload.eventId)) return;
      if (payload.boardId && payload.boardId !== currentBoardId) return;

      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.filter((c) => c.id !== payload.columnId),
        };
      });
    };

    socket.on('task:created', handleTaskCreatedSocket);
    socket.on('task:updated', handleTaskUpdatedSocket);
    socket.on('task:moved', handleTaskMovedSocket);
    socket.on('task:deleted', handleTaskDeletedSocket);
    socket.on('column:created', handleColumnCreatedSocket);
    socket.on('column:moved', handleColumnMovedSocket);
    socket.on('column:updated', handleColumnUpdatedSocket);
    socket.on('column:deleted', handleColumnDeletedSocket);

    return () => {
      socket.off('task:created', handleTaskCreatedSocket);
      socket.off('task:updated', handleTaskUpdatedSocket);
      socket.off('task:moved', handleTaskMovedSocket);
      socket.off('task:deleted', handleTaskDeletedSocket);
      socket.off('column:created', handleColumnCreatedSocket);
      socket.off('column:moved', handleColumnMovedSocket);
      socket.off('column:updated', handleColumnUpdatedSocket);
      socket.off('column:deleted', handleColumnDeletedSocket);
    };
  }, [socket, currentBoardId, isDuplicateEvent]);

  // Handler: Task Created
  const handleTaskCreated = (newTask) => {
    if (!board) return;
    setBoard((prev) => {
      if (!prev) return prev;
      const alreadyExists = prev.columns?.some((c) =>
        c.tasks?.some((t) => t.id === newTask.id)
      );
      if (alreadyExists) {
        return {
          ...prev,
          columns: prev.columns.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) => (t.id === newTask.id ? newTask : t)),
          })),
        };
      }
      const updatedColumns = prev.columns.map((col) => {
        if (col.id === newTask.columnId) {
          return {
            ...col,
            tasks: [...(col.tasks || []), newTask].sort((a, b) => a.position - b.position),
          };
        }
        return col;
      });
      return { ...prev, columns: updatedColumns };
    });
  };

  // Handler: Column Created
  const handleColumnCreated = (newColumn) => {
    if (!board) return;
    setBoard((prev) => {
      if (!prev) return prev;
      if (prev.columns?.some((c) => c.id === newColumn.id)) return prev;
      return {
        ...prev,
        columns: [...(prev.columns || []), { ...newColumn, tasks: [] }].sort(
          (a, b) => a.position - b.position
        ),
      };
    });
  };

  // Handler: Column Renamed
  const handleRenameColumn = async (columnId, newName) => {
    try {
      const res = await api.put(`/columns/${columnId}`, { name: newName });
      if (res?.data) {
        setBoard((prev) => ({
          ...prev,
          columns: prev.columns.map((c) =>
            c.id === columnId ? { ...c, name: res.data.name } : c
          ),
        }));
      }
    } catch (err) {
      alert(err.message || 'Failed to rename column');
    }
  };

  // Handler: Column Deleted
  const handleDeleteColumn = async (columnId) => {
    try {
      await api.delete(`/columns/${columnId}`);
      setBoard((prev) => ({
        ...prev,
        columns: prev.columns.filter((c) => c.id !== columnId),
      }));
    } catch (err) {
      alert(err.message || 'Failed to delete column');
    }
  };

  // Handler: Task Updated in Drawer
  const handleTaskUpdated = (updatedTask) => {
    setSelectedTask(updatedTask);
    setBoard((prev) => {
      const updatedColumns = prev.columns.map((col) => {
        if (col.id === updatedTask.columnId) {
          return {
            ...col,
            tasks: col.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          };
        }
        return col;
      });
      return { ...prev, columns: updatedColumns };
    });
  };

  // Handler: Task Deleted in Drawer
  const handleTaskDeleted = (deletedTaskId) => {
    setSelectedTask(null);
    setBoard((prev) => {
      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        tasks: col.tasks.filter((t) => t.id !== deletedTaskId),
      }));
      return { ...prev, columns: updatedColumns };
    });
  };

  // Handler: Conflict Refresh Action
  const handleConflictRefresh = (authoritativeTask) => {
    fetchBoardSnapshot(currentBoardId);
    setSelectedTask(authoritativeTask);
  };

  // -------------------------------------------------------------
  // Drag and Drop Movement & OCC Implementation
  // -------------------------------------------------------------
  const handleDragStart = (event) => {
    const { active } = event;
    const taskData = active.data.current?.task;
    if (taskData) {
      setActiveTask(taskData);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !board) return;

    const activeTaskId = active.id;
    const overId = over.id;

    // Find source column and task
    let sourceCol = null;
    let draggedTask = null;
    for (const col of board.columns) {
      const found = col.tasks?.find((t) => t.id === activeTaskId);
      if (found) {
        sourceCol = col;
        draggedTask = found;
        break;
      }
    }

    if (!sourceCol || !draggedTask) return;

    // Determine target column and target index
    let targetCol = null;
    let targetIndex = 0;

    // Case 1: Dropped directly over a column container
    const isOverColumn = board.columns.find((c) => c.id === overId);
    if (isOverColumn) {
      targetCol = isOverColumn;
      targetIndex = isOverColumn.tasks?.length || 0;
    } else {
      // Case 2: Dropped over another task
      for (const col of board.columns) {
        const idx = col.tasks?.findIndex((t) => t.id === overId);
        if (idx !== -1 && idx !== undefined) {
          targetCol = col;
          targetIndex = idx;
          break;
        }
      }
    }

    if (!targetCol) return;

    // If dropped in exact same place, no mutation needed
    if (sourceCol.id === targetCol.id && draggedTask.position === targetIndex) {
      return;
    }

    // Save snapshot for rollback on network or concurrency failure
    const previousBoard = JSON.parse(JSON.stringify(board));

    // 1. Optimistic UI update
    setBoard((prev) => {
      const newColumns = prev.columns.map((col) => ({
        ...col,
        tasks: [...col.tasks],
      }));

      const srcCol = newColumns.find((c) => c.id === sourceCol.id);
      const dstCol = newColumns.find((c) => c.id === targetCol.id);

      if (srcCol.id === dstCol.id) {
        // Reordering within same column
        const [moved] = srcCol.tasks.splice(
          srcCol.tasks.findIndex((t) => t.id === draggedTask.id),
          1
        );
        srcCol.tasks.splice(targetIndex, 0, moved);
        srcCol.tasks = srcCol.tasks.map((t, i) => ({ ...t, position: i }));
      } else {
        // Moving across columns
        const [moved] = srcCol.tasks.splice(
          srcCol.tasks.findIndex((t) => t.id === draggedTask.id),
          1
        );
        moved.columnId = dstCol.id;
        dstCol.tasks.splice(targetIndex, 0, moved);

        srcCol.tasks = srcCol.tasks.map((t, i) => ({ ...t, position: i }));
        dstCol.tasks = dstCol.tasks.map((t, i) => ({ ...t, position: i }));
      }

      return { ...prev, columns: newColumns };
    });

    // 2. Persist to PostgreSQL with OCC version check
    try {
      const res = await api.post(`/tasks/${draggedTask.id}/move`, {
        targetColumnId: targetCol.id,
        newPosition: targetIndex,
        version: draggedTask.version, // Monotonic version check
      });

      if (res?.data) {
        // Record reversible action for Undo/Redo
        recordAction({
          type: 'TASK_MOVE',
          description: `Move "${draggedTask.title}" to ${targetCol.name}`,
          taskId: draggedTask.id,
          boardId: board.id,
          expectedVersion: res.data.version,
          executeReversal: async (expectedVersion) => {
            const rollbackRes = await api.post(`/tasks/${draggedTask.id}/move`, {
              targetColumnId: sourceCol.id,
              newPosition: draggedTask.position,
              version: expectedVersion,
            });
            fetchBoardSnapshot(board.id);
            return rollbackRes.data;
          },
          executeForward: async (expectedVersion) => {
            const fwdRes = await api.post(`/tasks/${draggedTask.id}/move`, {
              targetColumnId: targetCol.id,
              newPosition: targetIndex,
              version: expectedVersion,
            });
            fetchBoardSnapshot(board.id);
            return fwdRes.data;
          },
        });

        // Update task version in local state with returned version
        setBoard((prev) => {
          const updatedColumns = prev.columns.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) => (t.id === res.data.id ? res.data : t)),
          }));
          return { ...prev, columns: updatedColumns };
        });
      }
    } catch (err) {
      console.error('Task move failed:', err);
      // Rollback optimistic state
      setBoard(previousBoard);

      if (err.statusCode === 409) {
        setConflictDetails(err.details);
      } else {
        setError(err.message || 'Failed to move task. Reverted changes to original state.');
        setTimeout(() => setError(''), 6000);
      }
    }
  };

  // Zero-board state
  if (!loading && (!boards || boards.length === 0)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 mb-4 shadow-xs">
          <FolderPlus className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">No boards in this workspace</h2>
        <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6">
          Get started by creating your first Kanban board to organize tasks and workflows.
        </p>
        {(effectiveRole === 'ORG_ADMIN' || effectiveRole === 'TENANT_ADMIN') && (
          <Button
            variant="primary"
            icon={Plus}
            size="md"
            onClick={() => setIsCreateBoardOpen(true)}
          >
            Create First Board
          </Button>
        )}
        <CreateBoardModal
          isOpen={isCreateBoardOpen}
          onClose={() => setIsCreateBoardOpen(false)}
          onCreated={(newBoard) => {
            setCurrentBoardId(newBoard.id);
            setSearchParams({ boardId: newBoard.id }, { replace: true });
            fetchTenantBoards(newBoard.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative overflow-hidden">
      {/* 1. Board Header Canvas */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
              <span>Boards</span>
              <span>/</span>
              <span className="text-slate-800 font-semibold">{board?.name || 'Board'}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {board?.name || 'Loading board...'}
              </h1>
              <button
                className="text-slate-400 hover:text-amber-500 transition-colors"
                title="Star this board"
              >
                <Star className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {board?.description || 'Active Kanban workflow workspace'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time synchronization indicator (truthful Phase 4 status) */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] font-medium text-slate-600 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Real-Time Sync: Phase 4 Ready</span>
            </div>

            {/* Modern Searchable Board Selector */}
            <BoardSelector
              boards={boards}
              currentBoardId={currentBoardId}
              onSelectBoard={handleSelectBoard}
              onCreateBoard={() => setIsCreateBoardOpen(true)}
              canCreateBoard={effectiveRole === 'ORG_ADMIN' || effectiveRole === 'TENANT_ADMIN'}
            />

            {/* Add Column button (Admin only) */}
            {(effectiveRole === 'ORG_ADMIN' || effectiveRole === 'TENANT_ADMIN') && (
              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => setIsCreateColumnOpen(true)}
              >
                Add Column
              </Button>
            )}

            {/* Primary Add Task button */}
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setDefaultColumnId(board?.columns?.[0]?.id || null);
                setIsCreateTaskOpen(true);
              }}
              className="bg-brand-600 hover:bg-brand-700 text-white font-medium"
            >
              Add Task
            </Button>
          </div>
        </div>

        {/* View bar matching reference */}
        <div className="flex items-center justify-between gap-4 mt-5 pt-3 border-t border-slate-100 overflow-x-auto">
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700">
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => fetchBoardSnapshot(currentBoardId)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Refresh board state"
            >
              <RefreshCw className="w-3 h-3 text-slate-400" />
              <span>Sync</span>
            </button>

            {/* Undo / Redo Toolbar Controls */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2 ml-1">
              <button
                onClick={() =>
                  undo(getCurrentTask).catch((err) => {
                    if (err.statusCode === 409) setConflictDetails(err.details);
                  })
                }
                disabled={!canUndo || isExecuting}
                data-testid="undo-btn"
                title="Undo (Ctrl+Z)"
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                  canUndo && !isExecuting
                    ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                    : 'text-slate-300 cursor-not-allowed'
                }`}
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button
                onClick={() =>
                  redo(getCurrentTask).catch((err) => {
                    if (err.statusCode === 409) setConflictDetails(err.details);
                  })
                }
                disabled={!canRedo || isExecuting}
                data-testid="redo-btn"
                title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                  canRedo && !isExecuting
                    ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
                    : 'text-slate-300 cursor-not-allowed'
                }`}
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Redo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Operation Error Banner */}
      {error && (
        <div
          data-testid="operation-error-banner"
          className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-800 flex items-center justify-between animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-0.5 rounded hover:bg-rose-100 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Undo Error Banner */}
      {undoError && (
        <div
          data-testid="undo-error-banner"
          className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-800 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{undoError}</span>
          </div>
        </div>
      )}

      {/* 2. Drag and Drop Kanban Board Canvas */}
      <div className="flex-1 p-6 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            Loading board workspace...
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-5 h-full items-start">
              {board?.columns?.map((col) => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tasks={col.tasks || []}
                  selectedTaskId={selectedTask?.id}
                  onSelectTask={(task) => setSelectedTask(task)}
                  onAddTaskToColumn={(colId) => {
                    setDefaultColumnId(colId);
                    setIsCreateTaskOpen(true);
                  }}
                  onRenameColumn={handleRenameColumn}
                  onDeleteColumn={handleDeleteColumn}
                />
              ))}
            </div>

            {/* Drag Overlay for smooth card movement */}
            <DragOverlay>
              {activeTask ? (
                <div className="w-72 bg-white p-3.5 rounded-xl border-2 border-brand-500 shadow-2xl select-none rotate-1">
                  <p className="text-xs font-semibold text-slate-800 leading-snug">
                    {activeTask.title}
                  </p>
                  <span className="text-[10px] text-brand-600 font-mono mt-1 block">
                    v{activeTask.version}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* 3. Task Details Drawer */}
      {selectedTask && (
        <TaskDetailsDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
          onConflict={(details) => setConflictDetails(details)}
        />
      )}

      {/* Modals */}
      {board && (
        <>
          <CreateTaskModal
            isOpen={isCreateTaskOpen}
            onClose={() => setIsCreateTaskOpen(false)}
            boardId={board.id}
            columns={board.columns || []}
            defaultColumnId={defaultColumnId}
            onCreated={handleTaskCreated}
          />
          <CreateColumnModal
            isOpen={isCreateColumnOpen}
            onClose={() => setIsCreateColumnOpen(false)}
            boardId={board.id}
            onCreated={handleColumnCreated}
          />
        </>
      )}

      <CreateBoardModal
        isOpen={isCreateBoardOpen}
        onClose={() => setIsCreateBoardOpen(false)}
        onCreated={(newBoard) => {
          setCurrentBoardId(newBoard.id);
          setSearchParams({ boardId: newBoard.id }, { replace: true });
          fetchTenantBoards(newBoard.id);
        }}
      />

      {/* 4. HTTP 409 Conflict Modal */}
      <ConflictModal
        isOpen={!!conflictDetails}
        onClose={() => setConflictDetails(null)}
        conflictDetails={conflictDetails}
        onRefresh={handleConflictRefresh}
      />
    </div>
  );
}

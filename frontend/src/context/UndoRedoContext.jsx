import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api/client';

const UndoRedoContext = createContext(null);

export function UndoRedoProvider({ children }) {
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [undoError, setUndoError] = useState('');

  // Clear undo/redo stacks when switching boards or logging out
  const resetStacks = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    setUndoError('');
  }, []);

  /**
   * Register a reversible action onto the undo stack.
   * Clears the redo stack whenever a new user mutation occurs.
   */
  const recordAction = useCallback((action) => {
    // action: { type, description, taskId, boardId, executeReversal, executeForward }
    setUndoStack((prev) => [action, ...prev.slice(0, 49)]); // max 50 actions
    setRedoStack([]);
  }, []);

  /**
   * Undo the most recent action.
   * Concurrency Safe: Validates that the task is still at the revision produced by this action.
   * Rejects if another collaborator (e.g. Charlie) subsequently modified the task.
   */
  const undo = useCallback(
    async (getCurrentTask) => {
      if (undoStack.length === 0 || isExecuting) return;

      const [actionToUndo, ...remainingUndo] = undoStack;
      setIsExecuting(true);
      setUndoError('');

      try {
        const currentTask = getCurrentTask ? getCurrentTask(actionToUndo.taskId) : null;
        if (!currentTask) {
          throw new Error('Task no longer exists on this board.');
        }

        // Concurrency Guard: If another collaborator modified this task, current version > expectedVersion
        if (actionToUndo.expectedVersion && currentTask.version !== actionToUndo.expectedVersion) {
          const conflictErr = new Error('Cannot undo: Task was modified by another collaborator.');
          conflictErr.statusCode = 409;
          conflictErr.details = {
            taskId: actionToUndo.taskId,
            currentVersion: currentTask.version,
            expectedVersion: actionToUndo.expectedVersion,
          };
          throw conflictErr;
        }

        // Execute reversal passing the recorded revision produced by this action
        const result = await actionToUndo.executeReversal(actionToUndo.expectedVersion || currentTask.version);

        // Move to redo stack, recording the new version produced by this reversal
        const redoAction = {
          ...actionToUndo,
          expectedVersion: result?.version,
        };
        setUndoStack(remainingUndo);
        setRedoStack((prev) => [redoAction, ...prev]);

        return result;
      } catch (err) {
        console.warn('[Undo] Reversal failed:', err.message);
        if (err.statusCode === 409) {
          setUndoError('Cannot undo: Task was modified by another collaborator.');
        } else {
          setUndoError(err.message || 'Failed to undo action');
        }
        // Drop stale action from undo stack so user isn't stuck
        setUndoStack(remainingUndo);
        throw err;
      } finally {
        setIsExecuting(false);
      }
    },
    [undoStack, isExecuting]
  );

  /**
   * Redo the most recently undone action.
   * Concurrency Safe: Validates that the task is still at the revision produced by the undo action.
   */
  const redo = useCallback(
    async (getCurrentTask) => {
      if (redoStack.length === 0 || isExecuting) return;

      const [actionToRedo, ...remainingRedo] = redoStack;
      setIsExecuting(true);
      setUndoError('');

      try {
        const currentTask = getCurrentTask ? getCurrentTask(actionToRedo.taskId) : null;
        if (!currentTask) {
          throw new Error('Task no longer exists on this board.');
        }

        // Concurrency Guard: If another collaborator modified this task while undone
        if (actionToRedo.expectedVersion && currentTask.version !== actionToRedo.expectedVersion) {
          const conflictErr = new Error('Cannot redo: Task was modified by another collaborator.');
          conflictErr.statusCode = 409;
          conflictErr.details = {
            taskId: actionToRedo.taskId,
            currentVersion: currentTask.version,
            expectedVersion: actionToRedo.expectedVersion,
          };
          throw conflictErr;
        }

        // Execute forward mutation with recorded version
        const result = await actionToRedo.executeForward(actionToRedo.expectedVersion || currentTask.version);

        // Move to undo stack, recording the new version produced by this forward action
        const undoAction = {
          ...actionToRedo,
          expectedVersion: result?.version,
        };
        setRedoStack(remainingRedo);
        setUndoStack((prev) => [undoAction, ...prev]);

        return result;
      } catch (err) {
        console.warn('[Redo] Action failed:', err.message);
        if (err.statusCode === 409) {
          setUndoError('Cannot redo: Task was modified by another collaborator.');
        } else {
          setUndoError(err.message || 'Failed to redo action');
        }
        setRedoStack(remainingRedo);
        throw err;
      } finally {
        setIsExecuting(false);
      }
    },
    [redoStack, isExecuting]
  );

  const canUndo = undoStack.length > 0 && !isExecuting;
  const canRedo = redoStack.length > 0 && !isExecuting;

  const value = {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    isExecuting,
    undoError,
    recordAction,
    undo,
    redo,
    resetStacks,
  };

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>;
}

export function useUndoRedo() {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error('useUndoRedo must be used within an UndoRedoProvider');
  }
  return context;
}

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
   * Treats reversal as a new authorized mutation validating current monotonic version.
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

        // Execute reversal with current version
        const result = await actionToUndo.executeReversal(currentTask.version);

        // Move to redo stack
        setUndoStack(remainingUndo);
        setRedoStack((prev) => [actionToUndo, ...prev]);

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

        // Execute forward mutation with current version
        const result = await actionToRedo.executeForward(currentTask.version);

        // Move to undo stack
        setRedoStack(remainingRedo);
        setUndoStack((prev) => [actionToRedo, ...prev]);

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

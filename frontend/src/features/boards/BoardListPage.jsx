import React, { useEffect, useState, useCallback } from 'react';
import { LayoutGrid, Plus, Star, MoreHorizontal, ArrowRight, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { CreateBoardModal } from '../../components/modals/CreateBoardModal';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api/client';
import { useNavigate } from 'react-router-dom';

export function BoardListPage() {
  const { activeTenant, effectiveRole } = useAuth();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();

  const fetchBoards = useCallback(async () => {
    if (!activeTenant?.id) return;
    try {
      setLoading(true);
      const res = await api.get('/boards');
      if (res?.data) {
        setBoards(res.data);
      }
    } catch (err) {
      console.error('Failed to load boards:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const handleDeleteBoard = async (e, boardId, boardName) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete board "${boardName}" and all its tasks?`)) {
      return;
    }

    try {
      await api.delete(`/boards/${boardId}`);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (err) {
      alert(err.message || 'Failed to delete board');
    }
  };

  const canManage = effectiveRole === 'ORG_ADMIN' || effectiveRole === 'TENANT_ADMIN';

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-6xl mx-auto w-full">
      {/* Header matching approved reference */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-1">
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>{activeTenant?.name || 'Workspace'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Boards
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage Kanban boards in this workspace
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            icon={Plus}
            size="sm"
            onClick={() => setIsCreateOpen(true)}
          >
            Create Board
          </Button>
        )}
      </div>

      {/* Boards List Canvas */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading workspace boards...</div>
        ) : boards.length > 0 ? (
          boards.map((board) => (
            <div
              key={board.id}
              onClick={() => navigate(`/?boardId=${board.id}`)}
              className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-brand-300 hover:shadow-card transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 text-brand-600">
                  <Star className="w-4 h-4 fill-brand-100 text-brand-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800 group-hover:text-brand-700 truncate">
                    {board.name}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {board.columnCount || 0} columns · {board.taskCount || 0} tasks · Updated{' '}
                    {new Date(board.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-brand-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                  Open board
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
                {canManage && (
                  <button
                    onClick={(e) => handleDeleteBoard(e, board.id, board.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                    title="Delete board"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 bg-white border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
            No boards found in this workspace. Click "Create Board" to get started.
          </div>
        )}
      </div>

      <CreateBoardModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => fetchBoards()}
      />
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { History, ChevronDown, CheckCircle2, MoveRight, PlusCircle, Edit3, Trash2, LayoutGrid } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api/client';

export function ActivityPage() {
  const { activeTenant } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadActivities() {
      if (!activeTenant?.id) return;
      try {
        setLoading(true);
        // Fetch boards for tenant first
        const boardsRes = await api.get('/boards');
        if (boardsRes?.data && boardsRes.data.length > 0) {
          // Fetch activities for first board or aggregate
          const firstBoard = boardsRes.data[0];
          const actRes = await api.get(`/boards/${firstBoard.id}/activities?limit=50`);
          if (actRes?.data) {
            setActivities(actRes.data);
          }
        } else {
          setActivities([]);
        }
      } catch (err) {
        console.error('Failed to load activities:', err);
      } finally {
        setLoading(false);
      }
    }
    loadActivities();
  }, [activeTenant]);

  const getActionIcon = (action) => {
    switch (action) {
      case 'TASK_MOVED':
        return { icon: MoveRight, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' };
      case 'TASK_UPDATED':
        return { icon: Edit3, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
      case 'TASK_CREATED':
      case 'COLUMN_CREATED':
      case 'BOARD_CREATED':
        return { icon: PlusCircle, color: 'text-amber-600 bg-amber-50 border-amber-200' };
      case 'TASK_DELETED':
      case 'COLUMN_DELETED':
        return { icon: Trash2, color: 'text-rose-600 bg-rose-50 border-rose-200' };
      default:
        return { icon: LayoutGrid, color: 'text-slate-600 bg-slate-50 border-slate-200' };
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-1">
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Activity History
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track all mutations, updates, and collaborative actions
          </p>
        </div>

        <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs">
          <span>All Activities</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* Activity Timeline matching approved reference */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading audit trail...</div>
        ) : activities.length > 0 ? (
          activities.map((item) => {
            const { icon: Icon, color } = getActionIcon(item.action);
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition-colors"
              >
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${color}`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-800 leading-snug">
                    <span className="font-semibold text-slate-900">
                      {item.user?.name || 'User'}
                    </span>{' '}
                    <span className="text-slate-500">
                      {item.action === 'TASK_MOVED'
                        ? 'moved task'
                        : item.action === 'TASK_UPDATED'
                        ? 'updated task'
                        : item.action === 'TASK_CREATED'
                        ? 'created task'
                        : item.action === 'TASK_DELETED'
                        ? 'deleted task'
                        : item.action.toLowerCase()}
                    </span>{' '}
                    {item.details?.title && (
                      <span className="font-medium text-brand-700">"{item.details.title}"</span>
                    )}
                  </p>
                  <span className="text-[11px] text-slate-400">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 bg-white border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
            No activity records recorded yet in this workspace.
          </div>
        )}
      </div>
    </div>
  );
}

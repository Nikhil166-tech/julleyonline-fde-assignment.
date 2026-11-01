import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Trash2, Calendar, ShieldCheck, Clock, Save, AlertCircle } from 'lucide-react';
import { PriorityBadge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api/client';
import { useAuth } from '../../context/AuthContext';
import { useUndoRedo } from '../../context/UndoRedoContext';

export function TaskDetailsDrawer({
  task,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
  onConflict,
}) {
  const { user, activeTenant, effectiveRole } = useAuth();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [assignedToUserId, setAssignedToUserId] = useState(task.assignedToUserId || '');
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
  );
  const [members, setMembers] = useState([]);
  const { recordAction } = useUndoRedo();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setPriority(task.priority);
    setAssignedToUserId(task.assignedToUserId || '');
    setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
  }, [task]);

  useEffect(() => {
    async function loadMembers() {
      if (!activeTenant?.id) return;
      try {
        const res = await api.get(`/tenants/${activeTenant.id}/members`);
        if (res?.data) {
          setMembers(res.data);
        }
      } catch (err) {
        console.error('Failed to load members for assignee list:', err);
      }
    }
    loadMembers();
  }, [activeTenant]);

  const canDelete =
    effectiveRole === 'ORG_ADMIN' ||
    effectiveRole === 'TENANT_ADMIN' ||
    task.createdByUserId === user?.id;

  const handleFieldSave = async (updatedFields) => {
    try {
      setSaving(true);
      setError('');
      const res = await api.put(`/tasks/${task.id}`, {
        title: updatedFields.title ?? title,
        description: updatedFields.description !== undefined ? updatedFields.description : description,
        priority: updatedFields.priority ?? priority,
        assignedToUserId:
          updatedFields.assignedToUserId !== undefined
            ? updatedFields.assignedToUserId
            : assignedToUserId || null,
        dueDate: updatedFields.dueDate
          ? new Date(updatedFields.dueDate).toISOString()
          : null,
        version: task.version, // Monotonic optimistic locking version
      });

      if (res?.data) {
        const previousSnapshot = {
          title: task.title,
          description: task.description,
          priority: task.priority,
          assignedToUserId: task.assignedToUserId,
          dueDate: task.dueDate,
        };
        const currentMutation = {
          title: updatedFields.title ?? title,
          description: updatedFields.description !== undefined ? updatedFields.description : description,
          priority: updatedFields.priority ?? priority,
          assignedToUserId:
            updatedFields.assignedToUserId !== undefined
              ? updatedFields.assignedToUserId
              : assignedToUserId || null,
          dueDate: updatedFields.dueDate
            ? new Date(updatedFields.dueDate).toISOString()
            : null,
        };

        recordAction({
          type: 'TASK_UPDATE',
          description: `Update "${task.title}"`,
          taskId: task.id,
          boardId: task.boardId,
          executeReversal: async (currentVersion) => {
            const rollbackRes = await api.put(`/tasks/${task.id}`, {
              ...previousSnapshot,
              version: currentVersion,
            });
            onTaskUpdated(rollbackRes.data);
            return rollbackRes.data;
          },
          executeForward: async (currentVersion) => {
            const fwdRes = await api.put(`/tasks/${task.id}`, {
              ...currentMutation,
              version: currentVersion,
            });
            onTaskUpdated(fwdRes.data);
            return fwdRes.data;
          },
        });

        onTaskUpdated(res.data);
      }
    } catch (err) {
      if (err.statusCode === 409) {
        onConflict(err.details);
      } else {
        setError(err.message || 'Failed to update task');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${task.title}"?`)) return;

    try {
      setDeleting(true);
      setError('');
      await api.delete(`/tasks/${task.id}`);
      onTaskDeleted(task.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      data-testid="task-details-drawer"
      className="absolute top-0 right-0 bottom-0 w-80 lg:w-96 bg-white border-l border-slate-200 shadow-2xl flex flex-col z-30 animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Task Details</span>
          <span className="text-[10px] bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded font-mono font-bold">
            v{task.version}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Delete task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 p-5 overflow-y-auto space-y-5 text-xs">
        {/* Title Input */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Task Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== task.title) {
                handleFieldSave({ title: title.trim() });
              }
            }}
            className="w-full font-bold text-sm text-slate-900 px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* Priority & Due Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                handleFieldSave({ priority: e.target.value });
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-brand-500"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                handleFieldSave({ dueDate: e.target.value });
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Assignee Selection */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Assignee
          </label>
          <select
            value={assignedToUserId}
            onChange={(e) => {
              setAssignedToUserId(e.target.value);
              handleFieldSave({ assignedToUserId: e.target.value || null });
            }}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-brand-500"
          >
            <option value="">Unassigned</option>
            {members.map((m) => {
              const uid = m.userId || m.user?.id || m.id;
              const name = m.name || m.user?.name || 'User';
              const email = m.email || m.user?.email || '';
              return (
                <option key={uid} value={uid}>
                  {name} {email ? `(${email})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Description Textarea */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Description
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== (task.description || '')) {
                handleFieldSave({ description: description.trim() || null });
              }
            }}
            placeholder="Add detailed task notes or specifications..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 leading-relaxed"
          />
        </div>

        {/* Metadata Footer */}
        <div className="pt-4 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
          <div className="flex items-center justify-between">
            <span>Created by:</span>
            <span className="font-semibold text-slate-800">{task.creator?.name || 'User'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Created at:</span>
            <span>{new Date(task.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last modified:</span>
            <span>{new Date(task.updatedAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>OCC Version:</span>
            <span className="font-mono font-bold text-brand-600">v{task.version}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

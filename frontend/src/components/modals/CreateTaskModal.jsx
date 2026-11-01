import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../lib/api/client';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle } from 'lucide-react';

export function CreateTaskModal({
  isOpen,
  onClose,
  boardId,
  columns = [],
  defaultColumnId = null,
  onCreated,
}) {
  const { activeTenant } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnId, setColumnId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultColumnId) {
      setColumnId(defaultColumnId);
    } else if (columns.length > 0) {
      setColumnId(columns[0].id);
    }
  }, [defaultColumnId, columns, isOpen]);

  useEffect(() => {
    async function loadMembers() {
      if (!activeTenant?.id || !isOpen) return;
      try {
        const res = await api.get(`/tenants/${activeTenant.id}/members`);
        if (res?.data) {
          setMembers(res.data);
        }
      } catch (err) {
        console.error('Failed to load tenant members:', err);
      }
    }
    loadMembers();
  }, [activeTenant, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }
    if (!columnId) {
      setError('Please select a destination column');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/boards/${boardId}/tasks`, {
        columnId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assignedToUserId: assignedToUserId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });

      if (res?.data) {
        setTitle('');
        setDescription('');
        setAssignedToUserId('');
        setDueDate('');
        onCreated(res.data);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Task" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Task Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Implement Optimistic Locking"
            required
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Column *</label>
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 bg-white"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 bg-white"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Assignee</label>
            <select
              value={assignedToUserId}
              onChange={(e) => setAssignedToUserId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 bg-white"
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

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 bg-white"
            >
            </input>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Description</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add detailed task notes or specifications..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            Create Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

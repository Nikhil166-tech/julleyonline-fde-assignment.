import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../lib/api/client';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle, UserPlus } from 'lucide-react';

export function AddMemberModal({ isOpen, onClose, onAdded }) {
  const { activeTenant } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await api.post(`/tenants/${activeTenant.id}/members`, {
        email: email.trim(),
        role,
      });

      setEmail('');
      setRole('MEMBER');
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add member to workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Member to Workspace">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block font-semibold text-slate-700 mb-1">User Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. teammate@acme.com"
            required
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Role *</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 bg-white"
          >
            <option value="MEMBER">Member (Task management & movement)</option>
            <option value="TENANT_ADMIN">Tenant Admin (Board, column & member management)</option>
          </select>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" icon={UserPlus} loading={loading}>
            Add Member
          </Button>
        </div>
      </form>
    </Modal>
  );
}

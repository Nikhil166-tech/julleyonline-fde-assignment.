import React, { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { RoleBadge } from '../../components/ui/Badge';
import { AddMemberModal } from '../../components/modals/AddMemberModal';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api/client';

export function MembersPage() {
  const { activeTenant, effectiveRole, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [error, setError] = useState('');

  const fetchMembers = useCallback(async () => {
    if (!activeTenant?.id) return;
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/tenants/${activeTenant.id}/members`);
      if (res?.data) {
        setMembers(res.data);
      }
    } catch (err) {
      console.error('Failed to load members:', err);
      setError(err.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleRoleChange = async (membershipId, newRole) => {
    try {
      setError('');
      await api.patch(`/tenants/${activeTenant.id}/members/${membershipId}`, {
        role: newRole,
      });
      fetchMembers();
    } catch (err) {
      setError(err.message || 'Failed to update member role');
    }
  };

  const handleRemoveMember = async (membershipId, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this workspace?`)) {
      return;
    }

    try {
      setError('');
      await api.delete(`/tenants/${activeTenant.id}/members/${membershipId}`);
      fetchMembers();
    } catch (err) {
      setError(err.message || 'Failed to remove member');
    }
  };

  const canManageMembers = effectiveRole === 'ORG_ADMIN' || effectiveRole === 'TENANT_ADMIN';

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-6xl mx-auto w-full">
      {/* Header matching approved reference */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-1">
            <Users className="w-3.5 h-3.5" />
            <span>Workspace Members</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Members
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage teammates, roles and workspace access permissions
          </p>
        </div>

        {canManageMembers && (
          <Button
            variant="primary"
            icon={Plus}
            size="sm"
            onClick={() => setIsAddOpen(true)}
          >
            Add Member
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 mt-6 border-b border-slate-200 text-xs font-semibold">
        <button className="pb-3 text-brand-600 border-b-2 border-brand-600 font-bold">
          All Members ({members.length})
        </button>
      </div>

      {/* Table */}
      <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider text-[11px] font-semibold">
            <tr>
              <th className="py-3 px-4">Member</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Joined</th>
              {canManageMembers && <th className="py-3 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  Loading workspace members...
                </td>
              </tr>
            ) : members.length > 0 ? (
              members.map((m) => {
                const memberUser = m.user || { id: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl };
                const memberId = m.membershipId || m.id;
                const isCurrentUser = memberUser.id === user?.id;
                return (
                  <tr key={memberId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={memberUser.name} email={memberUser.email} size="sm" />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {memberUser.name} {isCurrentUser && <span className="text-slate-400 font-normal">(You)</span>}
                          </p>
                          <p className="text-slate-500 text-[11px]">{memberUser.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {canManageMembers && !isCurrentUser ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(memberId, e.target.value)}
                          className="text-xs px-2 py-1 border border-slate-200 rounded-md bg-white font-medium text-slate-700 focus:outline-none focus:border-brand-500"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="TENANT_ADMIN">Tenant Admin</option>
                        </select>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(m.createdAt || m.joinedAt || Date.now()).toLocaleDateString()}
                    </td>
                    {canManageMembers && (
                      <td className="py-3 px-4 text-right">
                        {!isCurrentUser && (
                          <button
                            onClick={() => handleRemoveMember(memberId, memberUser.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove from workspace"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  No members found in this workspace.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddMemberModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdded={() => fetchMembers()}
      />
    </div>
  );
}

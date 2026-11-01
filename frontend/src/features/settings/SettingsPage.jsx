import React, { useState, useEffect } from 'react';
import { Building2, Layers, Settings as SettingsIcon, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api/client';

export function SettingsPage() {
  const { activeOrg, activeTenant, effectiveRole, refreshContexts } = useAuth();
  const [activeTab, setActiveTab] = useState('organization');
  const [orgName, setOrgName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (activeOrg) {
      setOrgName(activeOrg.name);
    }
  }, [activeOrg]);

  useEffect(() => {
    if (activeTenant) {
      setTenantName(activeTenant.name);
    }
  }, [activeTenant]);

  const handleSaveOrg = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');
      await api.patch(`/organizations/${activeOrg.id}`, {
        name: orgName.trim(),
      });
      setSuccessMsg('Organization name updated successfully');
      refreshContexts();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTenant = async (e) => {
    e.preventDefault();
    if (!tenantName.trim()) return;

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');
      await api.patch(`/tenants/${activeTenant.id}`, {
        name: tenantName.trim(),
      });
      setSuccessMsg('Workspace name updated successfully');
      refreshContexts();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update tenant workspace');
    } finally {
      setSaving(false);
    }
  };

  const isOrgAdmin = effectiveRole === 'ORG_ADMIN';
  const isTenantAdmin = effectiveRole === 'TENANT_ADMIN' || isOrgAdmin;

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="pb-6 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 mb-1">
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Workspace Preferences</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Settings
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Update organization profile, tenant parameters and permissions
        </p>
      </div>

      {successMsg && (
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Left Tabs + Right Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
        {/* Left Subnav */}
        <div className="space-y-1">
          <button
            onClick={() => {
              setActiveTab('organization');
              setSuccessMsg('');
              setErrorMsg('');
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
              activeTab === 'organization'
                ? 'bg-brand-50 text-brand-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Organization</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('tenant');
              setSuccessMsg('');
              setErrorMsg('');
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
              activeTab === 'tenant'
                ? 'bg-brand-50 text-brand-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Workspace (Tenant)</span>
          </button>
        </div>

        {/* Right Settings Form */}
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          {activeTab === 'organization' ? (
            <form onSubmit={handleSaveOrg} className="space-y-4 text-xs">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Organization Settings</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage organization name, slug, and enterprise profile
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Organization Name *
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={!isOrgAdmin}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Organization Slug
                </label>
                <input
                  type="text"
                  defaultValue={activeOrg?.slug || ''}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Slug is permanent and uniquely bound to the enterprise workspace.
                </span>
              </div>

              {isOrgAdmin ? (
                <div className="pt-2">
                  <Button type="submit" variant="primary" size="sm" icon={Save} loading={saving}>
                    Save Organization Changes
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  Only Organization Administrators can update organization settings.
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleSaveTenant} className="space-y-4 text-xs">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Workspace Settings</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure this tenant workspace parameters and team details
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  disabled={!isTenantAdmin}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Workspace Slug
                </label>
                <input
                  type="text"
                  defaultValue={activeTenant?.slug || ''}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>

              {isTenantAdmin ? (
                <div className="pt-2">
                  <Button type="submit" variant="primary" size="sm" icon={Save} loading={saving}>
                    Save Workspace Changes
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  Only Workspace Administrators can update workspace settings.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import {
  Building2,
  Layers,
  ChevronDown,
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { RoleBadge } from '../ui/Badge';
import { Dropdown } from '../ui/Dropdown';
import { useSocket } from '../../context/SocketContext';

export function Header({ onToggleSidebar }) {
  const {
    user,
    activeOrg,
    activeTenant,
    effectiveRole,
    contexts,
    switchOrg,
    switchTenant,
    logout,
  } = useAuth();

  const { connectionStatus, activeTenantUsers } = useSocket();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
      {/* Left Section: Mobile Menu + Org Selector + Tenant Switcher */}
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* 1. Organization Selector Dropdown */}
        <Dropdown
          align="left"
          width="w-64"
          trigger={({ isOpen }) => (
            <button
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                isOpen
                  ? 'border-brand-500 bg-brand-50/50 text-brand-900 ring-2 ring-brand-100'
                  : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/70 text-slate-700'
              }`}
            >
              <Building2 className="w-4 h-4 text-brand-600 shrink-0" />
              <span className="max-w-[140px] sm:max-w-[180px] truncate">
                {activeOrg?.name || 'Select Organization'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          )}
        >
          {({ close }) => (
            <div className="p-1.5 space-y-1">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Select Organization
              </div>

              {contexts.organizations?.length > 0 ? (
                contexts.organizations.map((org) => {
                  const isSelected = activeOrg?.id === org.id;
                  return (
                    <button
                      key={org.id}
                      onClick={() => {
                        switchOrg(org.id);
                        close();
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                        isSelected
                          ? 'bg-brand-50 text-brand-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{org.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-xs text-slate-500 text-center">
                  No organizations found
                </div>
              )}
            </div>
          )}
        </Dropdown>

        {/* 2. Tenant / Workspace Switcher Dropdown */}
        <Dropdown
          align="left"
          width="w-64"
          trigger={({ isOpen }) => (
            <button
              data-testid="tenant-switcher-trigger"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                isOpen
                  ? 'border-brand-500 bg-brand-50/50 text-brand-900 ring-2 ring-brand-100'
                  : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/70 text-slate-700'
              }`}
            >
              <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="max-w-[140px] sm:max-w-[180px] truncate">
                {activeTenant?.name || 'Select Workspace'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          )}
        >
          {({ close }) => {
            const currentOrgTenants = activeOrg?.tenants || [];
            return (
              <div className="p-1.5 space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Select Workspace
                </div>

                {currentOrgTenants.length > 0 ? (
                  currentOrgTenants.map((tenant) => {
                    const isSelected = activeTenant?.id === tenant.id;
                    return (
                      <button
                        key={tenant.id}
                        data-testid={`tenant-option-${tenant.slug}`}
                        onClick={() => {
                          switchTenant(tenant.id);
                          close();
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                          isSelected
                            ? 'bg-brand-50 text-brand-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate">{tenant.name}</p>
                            <p className="text-[10px] text-slate-400">
                              {tenant.userRole === 'ORG_ADMIN'
                                ? 'Org Admin'
                                : tenant.userRole === 'TENANT_ADMIN'
                                ? 'Tenant Admin'
                                : 'Member'}
                            </p>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-brand-600 shrink-0 ml-2" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-500 text-center">
                    No workspaces in this organization
                  </div>
                )}
              </div>
            );
          }}
        </Dropdown>
      </div>

      {/* Right Section: Live Sync + Presence + Search + Notifications + Help + Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Real-time Connection Indicator */}
        <div
          data-testid="connection-status-pill"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border"
          style={{
            backgroundColor: connectionStatus === 'connected' ? '#f0fdf4' : connectionStatus === 'reconnecting' ? '#fefce8' : '#fef2f2',
            borderColor: connectionStatus === 'connected' ? '#bbf7d0' : connectionStatus === 'reconnecting' ? '#fef08a' : '#fecaca',
            color: connectionStatus === 'connected' ? '#166534' : connectionStatus === 'reconnecting' ? '#854d0e' : '#991b1b',
          }}
          title={`Socket connection: ${connectionStatus}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-emerald-500'
                : connectionStatus === 'reconnecting'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-rose-500'
            }`}
          />
          <span className="capitalize">{connectionStatus === 'connected' ? 'Live' : connectionStatus}</span>
        </div>

        {/* Real-time Tenant Presence Stack */}
        {activeTenantUsers.length > 0 && (
          <div
            data-testid="presence-avatar-stack"
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 border border-slate-200"
            title={`Active in ${activeTenant?.name || 'workspace'}: ${activeTenantUsers.map((u) => u.name).join(', ')}`}
          >
            <div className="flex items-center -space-x-1.5">
              {activeTenantUsers.slice(0, 3).map((u) => (
                <Avatar
                  key={u.id}
                  name={u.name}
                  email={u.email}
                  avatarUrl={u.avatarUrl}
                  size="xs"
                  isOnline={true}
                  className="ring-2 ring-white"
                />
              ))}
              {activeTenantUsers.length > 3 && (
                <span className="w-5 h-5 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[9px] font-bold text-slate-600 select-none">
                  +{activeTenantUsers.length - 3}
                </span>
              )}
            </div>
            <span
              data-testid="active-users-count"
              className="text-[11px] font-semibold text-slate-700 whitespace-nowrap pr-0.5"
            >
              {activeTenantUsers.length} Online
            </span>
          </div>
        )}

        {/* Notifications Icon */}
        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* Help Icon */}
        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex"
          title="Help & Documentation"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* User Profile Pill & Dropdown */}
        <Dropdown
          align="right"
          width="w-60"
          trigger={({ isOpen }) => (
            <div
              className={`flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer select-none ${
                isOpen ? 'bg-slate-100' : ''
              }`}
            >
              <Avatar
                name={user?.name || 'Bob Johnson'}
                email={user?.email || 'bob@acme.com'}
                avatarUrl={user?.avatarUrl}
                size="sm"
                isOnline={true}
              />
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight">
                  {user?.name || 'Bob'}
                </p>
                <p className="text-[10px] text-slate-500 leading-tight">
                  {effectiveRole === 'ORG_ADMIN'
                    ? 'Org Admin'
                    : effectiveRole === 'TENANT_ADMIN'
                    ? 'Tenant Admin'
                    : 'Member'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5 shrink-0" />
            </div>
          )}
        >
          {({ close }) => (
            <div className="p-1 space-y-1">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {user?.name || 'Authenticated User'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                <div className="mt-1.5">
                  <RoleBadge role={effectiveRole} />
                </div>
              </div>

              <button
                onClick={() => {
                  logout();
                  close();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </Dropdown>
      </div>
    </header>
  );
}

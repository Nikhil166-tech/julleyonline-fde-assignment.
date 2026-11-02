import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  CheckSquare,
  Users,
  History,
  Settings,
  Home,
  Building2,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Dropdown } from '../ui/Dropdown';

export function Sidebar({ isOpen = true, onClose }) {
  const location = useLocation();
  const { activeOrg, activeTenant, contexts, switchTenant, switchOrg } = useAuth();

  const navItems = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Boards', path: '/boards', icon: LayoutGrid },
    { label: 'Tasks', path: '/tasks', icon: CheckSquare },
    { label: 'Members', path: '/members', icon: Users },
    { label: 'Activity', path: '/activity', icon: History },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-sidebar-bg flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-xs">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">JulleyOnline</span>
        </div>
      </div>

      {/* Main Navigation List */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-textHover'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Active Workspace Badge / Switcher */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <Dropdown
          align="left"
          width="w-60"
          className="bottom-full mb-2"
          trigger={({ isOpen }) => (
            <div
              className={`flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800 transition-colors cursor-pointer text-left ${
                isOpen ? 'ring-1 ring-brand-500' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                  <Building2 className="w-4 h-4 text-brand-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {activeOrg?.name || 'Acme Technologies'}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {activeTenant?.name || 'Engineering & Product'}
                  </p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            </div>
          )}
        >
          {({ close }) => (
            <div className="p-1.5 space-y-2">
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Switch Workspace
              </div>

              {contexts.organizations?.map((org) => (
                <div key={org.id} className="space-y-0.5">
                  <button
                    onClick={() => {
                      switchOrg(org.id);
                      close();
                    }}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <span>{org.name}</span>
                    {activeOrg?.id === org.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
                    )}
                  </button>

                  <div className="pl-3 space-y-0.5">
                    {org.tenants?.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          switchTenant(t.id);
                          close();
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-[11px] text-left transition-colors ${
                          activeTenant?.id === t.id
                            ? 'bg-brand-50 text-brand-700 font-medium'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="text-[10px] text-slate-400 ml-1">
                          {t.userRole === 'ORG_ADMIN'
                            ? 'Admin'
                            : t.userRole === 'TENANT_ADMIN'
                            ? 'Workspace Admin'
                            : 'Member'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Dropdown>
      </div>
    </aside>
  );
}

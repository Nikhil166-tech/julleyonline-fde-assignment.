import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Layers,
  ChevronDown,
  Search,
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  Check,
  X,
  Loader2,
  LayoutGrid,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { RoleBadge } from '../ui/Badge';
import { Dropdown } from '../ui/Dropdown';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../lib/api/client';

export function Header({ onToggleSidebar }) {
  const navigate = useNavigate();
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

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ boards: [], tasks: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Global ⌘K / Ctrl+K and Esc listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced live search across tenant boards and tasks
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults({ boards: [], tasks: [] });
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [boardsRes, tasksRes] = await Promise.all([
          api.get(`/boards?q=${encodeURIComponent(q)}`),
          api.get(`/tasks?q=${encodeURIComponent(q)}`),
        ]);
        setSearchResults({
          boards: boardsRes?.data || [],
          tasks: tasksRes?.data || [],
        });
      } catch (err) {
        console.error('Navbar search error:', err);
        setSearchResults({ boards: [], tasks: [] });
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTenant?.id]);

  const handleSelectBoard = (b) => {
    setSearchQuery('');
    setIsSearchOpen(false);
    navigate(`/tasks?boardId=${b.id}`);
  };

  const handleSelectTask = (t) => {
    setSearchQuery('');
    setIsSearchOpen(false);
    navigate(`/tasks?boardId=${t.boardId}&taskId=${t.id}`);
  };

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
        {/* Search Bar with live search across boards and tasks */}
        <div ref={searchContainerRef} className="hidden md:flex items-center relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            data-testid="navbar-search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => {
              if (searchQuery.trim().length > 0) setIsSearchOpen(true);
            }}
            placeholder="Search tasks, boards..."
            className="w-56 lg:w-72 pl-9 pr-12 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 text-slate-800 focus:outline-none focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500 transition-all"
          />

          {/* Clear Button or ⌘K Indicator */}
          {searchQuery ? (
            <button
              type="button"
              data-testid="navbar-search-clear"
              onClick={() => {
                setSearchQuery('');
                setSearchResults({ boards: [], tasks: [] });
                setIsSearchOpen(false);
                searchInputRef.current?.focus();
              }}
              className="absolute right-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-600 rounded"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-2 text-[10px] font-semibold text-slate-400 bg-white px-1.5 py-0.5 border border-slate-200 rounded pointer-events-none">
              ⌘K
            </kbd>
          )}

          {/* Live Search Results Dropdown */}
          {isSearchOpen && searchQuery.trim().length > 0 && (
            <div
              data-testid="navbar-search-results"
              className="absolute left-0 top-full mt-2 w-80 lg:w-96 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100"
            >
              {isSearching ? (
                <div className="flex items-center justify-center gap-2 p-4 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                  <span>Searching boards and tasks...</span>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto p-1.5 space-y-2">
                  {/* Boards List */}
                  {searchResults.boards.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <LayoutGrid className="w-3 h-3 text-slate-400" />
                        <span>Boards ({searchResults.boards.length})</span>
                      </div>
                      <div className="space-y-0.5">
                        {searchResults.boards.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            data-testid="search-result-board"
                            onClick={() => handleSelectBoard(b)}
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <LayoutGrid className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                              <span className="truncate font-semibold text-slate-800">{b.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">#{b.id.slice(0, 8)}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium shrink-0 ml-2">
                              {b.taskCount ?? 0} {b.taskCount === 1 ? 'task' : 'tasks'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks List */}
                  {searchResults.tasks.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <CheckSquare className="w-3 h-3 text-slate-400" />
                        <span>Tasks ({searchResults.tasks.length})</span>
                      </div>
                      <div className="space-y-0.5">
                        {searchResults.tasks.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            data-testid="search-result-task"
                            onClick={() => handleSelectTask(t)}
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors text-left"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="truncate font-medium text-slate-800">{t.title}</p>
                              <p className="text-[10px] text-slate-400 truncate">
                                {t.board?.name || 'Board'} • {t.column?.name || 'Column'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  t.priority === 'URGENT' || t.priority === 'HIGH'
                                    ? 'bg-rose-100 text-rose-700'
                                    : t.priority === 'LOW'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {t.priority}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No Results */}
                  {searchResults.boards.length === 0 && searchResults.tasks.length === 0 && (
                    <div className="p-4 text-center">
                      <p className="text-xs font-medium text-slate-700">No matching boards or tasks</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different name or keyword</p>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Helper */}
              <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[10px] text-slate-400 select-none">
                <span>esc to close</span>
                <span>click to open</span>
              </div>
            </div>
          )}
        </div>

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

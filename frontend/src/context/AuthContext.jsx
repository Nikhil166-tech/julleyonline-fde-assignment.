import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('julley_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contexts, setContexts] = useState({ organizations: [], activeContext: null });
  const [activeOrg, setActiveOrg] = useState(null);
  const [activeTenant, setActiveTenant] = useState(null);
  const [effectiveRole, setEffectiveRole] = useState(null);

  // Sync token and active workspace keys in localStorage
  const saveToken = (newToken) => {
    if (newToken) {
      localStorage.setItem('julley_token', newToken);
      setToken(newToken);
    } else {
      localStorage.removeItem('julley_token');
      localStorage.removeItem('julley_active_tenant_id');
      localStorage.removeItem('julley_active_org_id');
      setToken(null);
      setUser(null);
      setActiveOrg(null);
      setActiveTenant(null);
      setEffectiveRole(null);
      setContexts({ organizations: [], activeContext: null });
    }
  };

  // Fetch available organizations & tenants for context switching
  const loadContexts = useCallback(async () => {
    try {
      const res = await api.get('/auth/me/contexts');
      if (res?.data) {
        const orgs = Array.isArray(res.data) ? res.data : (res.data.organizations || []);
        setContexts({ organizations: orgs });

        const savedOrgId = localStorage.getItem('julley_active_org_id');
        const savedTenantId = localStorage.getItem('julley_active_tenant_id');

        let matchedOrg = orgs.find((o) => o.id === savedOrgId) || orgs[0] || null;
        let matchedTenant = null;

        if (matchedOrg) {
          const tenants = matchedOrg.tenants || [];
          const defaultTenant =
            tenants.find((t) => t.userRole === 'TENANT_ADMIN' || t.userRole === 'ORG_ADMIN') ||
            tenants[0] ||
            null;
          matchedTenant = tenants.find((t) => t.id === savedTenantId) || defaultTenant;
        }

        if (matchedOrg) {
          setActiveOrg(matchedOrg);
          localStorage.setItem('julley_active_org_id', matchedOrg.id);
        } else {
          // Deleting the last organization must clear stale authorization context.
          setActiveOrg(null);
          localStorage.removeItem('julley_active_org_id');
        }

        if (matchedTenant) {
          setActiveTenant(matchedTenant);
          setEffectiveRole(matchedTenant.userRole);
          localStorage.setItem('julley_active_tenant_id', matchedTenant.id);
        } else {
          // Likewise, a deleted or unassigned tenant must not remain active.
          setActiveTenant(null);
          setEffectiveRole(null);
          localStorage.removeItem('julley_active_tenant_id');
        }
      }
    } catch (err) {
      console.error('Failed to load contexts from server:', err);
    }
  }, []);

  // Fetch authenticated user profile on initial mount or token change
  const loadUserProfile = useCallback(async () => {
    const storedToken = localStorage.getItem('julley_token');
    if (!storedToken) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await api.get('/auth/me');
      if (res?.data) {
        setUser(res.data);
        await loadContexts();
      }
    } catch (err) {
      console.error('Failed to authenticate session:', err);
      saveToken(null);
    } finally {
      setLoading(false);
    }
  }, [loadContexts]);

  useEffect(() => {
    loadUserProfile();

    const handleUnauthorized = () => {
      saveToken(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [loadUserProfile]);

  // Login handler
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res?.data?.token) {
      saveToken(res.data.token);
      setUser(res.data.user);

      // Immediately fetch user contexts from server
      const ctxRes = await api.get('/auth/me/contexts');
      if (ctxRes?.data) {
        const orgs = Array.isArray(ctxRes.data) ? ctxRes.data : (ctxRes.data.organizations || []);
        setContexts({ organizations: orgs });
        if (orgs.length > 0) {
          const firstOrg = orgs[0];
          setActiveOrg(firstOrg);
          localStorage.setItem('julley_active_org_id', firstOrg.id);

          if (firstOrg.tenants && firstOrg.tenants.length > 0) {
            const defaultTenant =
              firstOrg.tenants.find((t) => t.userRole === 'TENANT_ADMIN' || t.userRole === 'ORG_ADMIN') ||
              firstOrg.tenants[0];
            setActiveTenant(defaultTenant);
            setEffectiveRole(defaultTenant.userRole);
            localStorage.setItem('julley_active_tenant_id', defaultTenant.id);
          }
        }
      }
      return res.data;
    }
  };

  // Register handler
  const register = async (formData) => {
    const res = await api.post('/auth/register', formData);
    if (res?.data?.token) {
      saveToken(res.data.token);
      setUser(res.data.user);
      if (res.data.organization) {
        setActiveOrg(res.data.organization);
        localStorage.setItem('julley_active_org_id', res.data.organization.id);
      }
      if (res.data.defaultTenant) {
        setActiveTenant(res.data.defaultTenant);
        setEffectiveRole('TENANT_ADMIN');
        localStorage.setItem('julley_active_tenant_id', res.data.defaultTenant.id);
      }
      await loadContexts();
      return res.data;
    }
  };

  // Logout handler
  const logout = () => {
    saveToken(null);
  };

  // Switch active Organization
  const switchOrg = (orgId) => {
    const targetOrg = contexts.organizations.find((o) => o.id === orgId);
    if (targetOrg) {
      setActiveOrg(targetOrg);
      localStorage.setItem('julley_active_org_id', targetOrg.id);

      const firstTenant = targetOrg.tenants?.[0] || null;
      if (firstTenant) {
        setActiveTenant(firstTenant);
        setEffectiveRole(firstTenant.userRole);
        localStorage.setItem('julley_active_tenant_id', firstTenant.id);
      } else {
        setActiveTenant(null);
        setEffectiveRole(null);
        localStorage.removeItem('julley_active_tenant_id');
      }
    }
  };

  // Switch active Tenant Workspace
  const switchTenant = async (tenantId) => {
    try {
      const res = await api.post('/auth/switch-context', { tenantId });
      if (res?.data) {
        const activeT = res.data.activeTenant || {
          id: res.data.tenantId,
          name: res.data.tenantName,
          slug: res.data.tenantSlug,
          orgId: res.data.organizationId,
          userRole: res.data.effectiveRole,
        };
        setActiveTenant(activeT);
        setEffectiveRole(res.data.effectiveRole);
        localStorage.setItem('julley_active_tenant_id', activeT.id);

        const parentOrg = contexts.organizations.find((o) => o.id === activeT.orgId);
        if (parentOrg) {
          setActiveOrg(parentOrg);
          localStorage.setItem('julley_active_org_id', parentOrg.id);
        }
      }
    } catch (err) {
      console.error('Failed to switch tenant context:', err);
      throw err;
    }
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    activeOrg,
    activeTenant,
    effectiveRole,
    contexts,
    login,
    register,
    logout,
    switchOrg,
    switchTenant,
    refreshContexts: loadContexts,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function Badge({ children, variant = 'default', size = 'sm', className = '', ...props }) {
  const baseStyles = 'inline-flex items-center font-medium rounded-full';

  const variants = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    primary: 'bg-brand-50 text-brand-700 border border-brand-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    // RBAC Role variants matching design reference
    orgAdmin: 'bg-amber-50 text-amber-800 border border-amber-300 font-semibold',
    tenantAdmin: 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold',
    member: 'bg-slate-100 text-slate-600 border border-slate-200',
    // Priority variants
    urgent: 'bg-purple-100 text-purple-800 border border-purple-200',
    high: 'bg-rose-50 text-rose-700 border border-rose-200',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200',
    low: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  };

  const sizes = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  return (
    <span className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))} {...props}>
      {children}
    </span>
  );
}

export function RoleBadge({ role }) {
  if (role === 'ORG_ADMIN') {
    return <Badge variant="orgAdmin">Org Admin</Badge>;
  }
  if (role === 'TENANT_ADMIN') {
    return <Badge variant="tenantAdmin">Tenant Admin</Badge>;
  }
  return <Badge variant="member">Member</Badge>;
}

export function PriorityBadge({ priority }) {
  const p = priority?.toUpperCase() || 'MEDIUM';
  if (p === 'URGENT') {
    return <Badge variant="urgent">⚡ Urgent</Badge>;
  }
  if (p === 'HIGH') {
    return <Badge variant="high">★ High</Badge>;
  }
  if (p === 'MEDIUM') {
    return <Badge variant="medium">★ Medium</Badge>;
  }
  return <Badge variant="low">• Low</Badge>;
}

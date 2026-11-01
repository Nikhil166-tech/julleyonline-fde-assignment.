import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const COLOR_PALETTES = [
  'bg-indigo-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-purple-500 text-white',
  'bg-blue-500 text-white',
  'bg-teal-500 text-white',
];

function getInitials(name = '') {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColorIndex(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % COLOR_PALETTES.length;
}

export function Avatar({
  name = '',
  email = '',
  avatarUrl = null,
  size = 'md',
  isOnline = false,
  className = '',
}) {
  const initials = getInitials(name || email);
  const colorClass = COLOR_PALETTES[getColorIndex(email || name)];

  const sizes = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-12 h-12 text-base',
  };

  const dotSizes = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-3.5 h-3.5',
  };

  return (
    <div className="relative inline-flex shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={twMerge(
            clsx('rounded-full object-cover border border-slate-200', sizes[size], className)
          )}
        />
      ) : (
        <div
          className={twMerge(
            clsx(
              'rounded-full font-semibold flex items-center justify-center select-none shadow-xs',
              colorClass,
              sizes[size],
              className
            )
          )}
          title={name || email}
        >
          {initials}
        </div>
      )}

      {isOnline && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 bg-emerald-500 border-2 border-white rounded-full',
            dotSizes[size]
          )}
        />
      )}
    </div>
  );
}

export function AvatarStack({ users = [], max = 3, size = 'sm' }) {
  const visible = users.slice(0, max);
  const remaining = users.length - max;

  return (
    <div className="flex items-center -space-x-1.5 overflow-hidden">
      {visible.map((u, i) => (
        <Avatar
          key={u.id || i}
          name={u.name}
          email={u.email}
          avatarUrl={u.avatarUrl}
          size={size}
          className="ring-2 ring-white"
        />
      ))}
      {remaining > 0 && (
        <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white text-slate-600 text-xs font-semibold flex items-center justify-center select-none shadow-xs">
          +{remaining}
        </div>
      )}
    </div>
  );
}

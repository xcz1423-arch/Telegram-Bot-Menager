import React from 'react';
import { BadgeCheck, Crown, Code2, ShieldCheck, Sparkles } from 'lucide-react';
import type { BadgeId } from '../../types';

export interface BadgeOption {
  id: BadgeId;
  label: string;
  description: string;
  colorClass: string;
  bgClass: string;
}

export const VERIFIED_BADGE_OPTIONS: BadgeOption[] = [
  {
    id: 'none',
    label: 'No Badge',
    description: 'Standard profile display',
    colorClass: 'text-[#73798C] dark:text-slate-400',
    bgClass: 'bg-slate-500/10 border-slate-500/20',
  },
  {
    id: 'verified_blue',
    label: 'Blue Verified',
    description: 'Official verified check',
    colorClass: 'text-[#22C8F6]',
    bgClass: 'bg-[#22C8F6]/15 border-[#22C8F6]/30',
  },
  {
    id: 'vip_gold',
    label: 'Gold Crown',
    description: 'VIP console badge',
    colorClass: 'text-[#F5B942]',
    bgClass: 'bg-[#F5B942]/15 border-[#F5B942]/30',
  },
  {
    id: 'dev_pro',
    label: 'Pro Developer',
    description: 'Bot engineer emblem',
    colorClass: 'text-[#7565F6] dark:text-[#A599FF]',
    bgClass: 'bg-[#7565F6]/15 border-[#7565F6]/30',
  },
  {
    id: 'shield_ops',
    label: 'Shield Ops',
    description: 'Security operator badge',
    colorClass: 'text-[#20C997]',
    bgClass: 'bg-[#20C997]/15 border-[#20C997]/30',
  },
  {
    id: 'creator',
    label: 'Creator Star',
    description: 'Featured bot creator',
    colorClass: 'text-[#F05B75]',
    bgClass: 'bg-[#F05B75]/15 border-[#F05B75]/30',
  },
];

function AdminCrownCrest({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="xcAdminShieldGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5B942" />
          <stop offset="50%" stopColor="#A599FF" />
          <stop offset="100%" stopColor="#22C8F6" />
        </linearGradient>
        <linearGradient id="xcAdminCrownGrad" x1="6" y1="6" x2="18" y2="17" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF3C4" />
          <stop offset="55%" stopColor="#F5B942" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.2L19.6 5.4V11.2C19.6 16.1 16.3 20.1 12 21.8C7.7 20.1 4.4 16.1 4.4 11.2V5.4L12 2.2Z"
        fill="#15102E"
        stroke="url(#xcAdminShieldGrad)"
        strokeWidth="1.6"
      />
      <path
        d="M7.6 14.8L6.8 9.4L9.7 11.6L12 7.8L14.3 11.6L17.2 9.4L16.4 14.8H7.6Z"
        fill="url(#xcAdminCrownGrad)"
      />
      <rect x="7.8" y="15.7" width="8.4" height="1.3" rx="0.65" fill="#FDE68A" />
      <circle cx="12" cy="12.5" r="0.9" fill="#22C8F6" />
    </svg>
  );
}

export function AdminExclusiveBadge({
  showLabel = false,
  size = 'sm',
}: {
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
}) {
  const iconCls = size === 'xs' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  if (showLabel) {
    return (
      <span
        title="Official Console Administrator"
        aria-label="Official Admin"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-[#F5B942]/50 bg-gradient-to-r from-[#7565F6]/20 via-[#F5B942]/18 to-[#22C8F6]/15 text-[#9A6807] dark:text-[#FDE68A] text-[10px] font-bold tracking-wide shadow-[0_0_14px_rgba(245,185,66,0.22)] shrink-0"
      >
        <AdminCrownCrest className={iconCls} />
        <span>Admin Crest</span>
      </span>
    );
  }

  return (
    <span
      title="Official Console Administrator"
      aria-label="Official Admin"
      className="inline-flex items-center justify-center shrink-0 drop-shadow-[0_0_6px_rgba(245,185,66,0.45)]"
    >
      <AdminCrownCrest className={iconCls} />
    </span>
  );
}

export function VerifiedBadgeIcon({
  badge,
  role,
  showLabel = false,
  size = 'sm',
}: {
  badge?: string | null;
  role?: 'admin' | 'user';
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
}) {
  const opt = badge && badge !== 'none' ? VERIFIED_BADGE_OPTIONS.find((b) => b.id === badge) : undefined;
  if (!opt && role !== 'admin') return null;

  const iconCls = size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  const Icon =
    badge === 'vip_gold'
      ? Crown
      : badge === 'dev_pro'
      ? Code2
      : badge === 'shield_ops'
      ? ShieldCheck
      : badge === 'creator'
      ? Sparkles
      : BadgeCheck;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {role === 'admin' && <AdminExclusiveBadge showLabel={showLabel} size={size} />}
      {opt &&
        (showLabel ? (
          <span
            title={opt.label}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${opt.bgClass} ${opt.colorClass}`}
          >
            <Icon className={iconCls} />
            <span>{opt.label}</span>
          </span>
        ) : (
          <span title={opt.label} aria-label={opt.label} className={`inline-flex items-center shrink-0 ${opt.colorClass}`}>
            <Icon className={iconCls} />
          </span>
        ))}
    </span>
  );
}

export function UserAvatar({
  avatarUrl,
  displayName,
  username,
  badge,
  role,
  size = 'md',
}: {
  avatarUrl?: string | null;
  displayName: string;
  username: string;
  badge?: string | null;
  role?: 'admin' | 'user';
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[11px]' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
  const initials = (displayName || username || 'U').slice(0, 2).toUpperCase();
  const ringCls =
    role === 'admin'
      ? 'border-2 border-[#F5B942]/80 ring-2 ring-[#7565F6]/35 shadow-[0_0_16px_rgba(245,185,66,0.22)]'
      : 'border border-[#E8EAF1] dark:border-slate-700';

  return (
    <div className="relative inline-flex items-center shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className={`${dim} rounded-full object-cover ${ringCls}`}
        />
      ) : (
        <div
          className={`${dim} rounded-full bg-[#6555E8] dark:bg-[#7565F6] text-white font-bold flex items-center justify-center ${ringCls}`}
        >
          {initials}
        </div>
      )}
      {role === 'admin' ? (
        <span className="-ml-2.5 mt-5 bg-white dark:bg-[#101421] rounded-full p-0.5 shadow-sm">
          <AdminExclusiveBadge size="xs" />
        </span>
      ) : (
        badge &&
        badge !== 'none' && (
          <span className="-ml-2 mt-4 bg-white dark:bg-[#101421] rounded-full p-0.5 shadow-xs">
            <VerifiedBadgeIcon badge={badge} size="xs" />
          </span>
        )
      )}
    </div>
  );
}

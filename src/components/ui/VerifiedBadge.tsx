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

export function VerifiedBadgeIcon({
  badge,
  showLabel = false,
  size = 'sm',
}: {
  badge?: string | null;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
}) {
  if (!badge || badge === 'none') return null;
  const opt = VERIFIED_BADGE_OPTIONS.find((b) => b.id === badge);
  if (!opt) return null;

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

  if (showLabel) {
    return (
      <span
        title={opt.label}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${opt.bgClass} ${opt.colorClass}`}
      >
        <Icon className={iconCls} />
        <span>{opt.label}</span>
      </span>
    );
  }

  return (
    <span title={opt.label} aria-label={opt.label} className={`inline-flex items-center shrink-0 ${opt.colorClass}`}>
      <Icon className={iconCls} />
    </span>
  );
}

export function UserAvatar({
  avatarUrl,
  displayName,
  username,
  badge,
  size = 'md',
}: {
  avatarUrl?: string | null;
  displayName: string;
  username: string;
  badge?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[11px]' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
  const initials = (displayName || username || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="relative inline-flex items-center shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className={`${dim} rounded-full object-cover border border-[#E8EAF1] dark:border-slate-700`}
        />
      ) : (
        <div
          className={`${dim} rounded-full bg-[#6555E8] dark:bg-[#7565F6] text-white font-bold flex items-center justify-center border border-[#7565F6]/30`}
        >
          {initials}
        </div>
      )}
      {badge && badge !== 'none' && (
        <span className=" -ml-2 mt-4 bg-white dark:bg-[#101421] rounded-full p-0.5 shadow-xs">
          <VerifiedBadgeIcon badge={badge} size="xs" />
        </span>
      )}
    </div>
  );
}

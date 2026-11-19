import React, { useEffect, useRef, useState } from 'react';
import {
  Settings,
  Shield,
  Activity,
  Download,
  Upload,
  KeyRound,
  LogOut,
  Database,
  UserCircle2,
  Users,
  Camera,
  Ban,
  CheckCircle2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Megaphone,
  History,
  Send,
  Smartphone,
  Monitor,
  LogIn,
  ShieldAlert,
  Globe,
  Clock,
} from 'lucide-react';
import { apiFetch, setCsrfToken } from '../../lib/api';
import { formatDeviceSummary, isMobileUserAgent } from '../../lib/deviceLabel';
import { prepareSquareAvatarJpeg } from '../../lib/imageUtils';
import type { AdminAuditEntry, AdminUser, BadgeId, ThemeMode, UserAccountSummary } from '../../types';
import { ConfirmDialog, StatusBadge } from '../ui/Primitives';
import { UserAvatar, VERIFIED_BADGE_OPTIONS, VerifiedBadgeIcon } from '../ui/VerifiedBadge';

interface HealthInfo {
  runtime: string;
  deploymentMode?: string;
  storageMode?: string;
  explicitMasterKeyConfigured?: boolean;
  databaseEngine: string;
  databaseConnected: boolean;
  tableCount: number;
  dbSizeKb: number;
  httpsActive: boolean;
  webhookEndpointReady: boolean;
  encryptionAlgorithm: string;
  recentErrors: Array<{ method: string; http_status: number; error_message: string; created_at: string }>;
}

const AUDIT_ACTION_BADGE: Record<string, { label: string; cls: string }> = {
  ACCOUNT_DELETED: { label: 'Account Deleted', cls: 'bg-[#F05B75]/15 text-[#F05B75] border-[#F05B75]/30' },
  USER_BLOCKED: { label: 'User Blocked', cls: 'bg-[#F5B942]/15 text-[#F5B942] border-[#F5B942]/30' },
  USER_UNBLOCKED: { label: 'User Unblocked', cls: 'bg-[#20C997]/15 text-[#20C997] border-[#20C997]/30' },
  ADMIN_PROMOTED: { label: 'Promoted to Admin', cls: 'bg-[#7565F6]/15 text-[#7565F6] dark:text-[#A599FF] border-[#7565F6]/30' },
  ADMIN_DEMOTED: { label: 'Admin Revoked', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  NOTIFICATION_SENT: { label: 'Notification Sent', cls: 'bg-[#22C8F6]/15 text-[#22C8F6] border-[#22C8F6]/30' },
};

export function SettingsHealthBackupView({
  admin,
  onAdminUpdated,
  theme,
  onSetTheme,
  appName,
  onAppNameChange,
  onRefreshAll,
  onToast,
}: {
  admin: AdminUser;
  onAdminUpdated: (next: AdminUser) => void;
  theme: ThemeMode;
  onSetTheme: (t: ThemeMode) => void;
  appName: string;
  onAppNameChange: (name: string) => void;
  onRefreshAll: () => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const isAdmin = admin.role === 'admin';
  const [subTab, setSubTab] = useState<'profile' | 'users' | 'settings' | 'security' | 'health' | 'backup'>('profile');

  // My Profile state
  const [profileName, setProfileName] = useState(admin.displayName);
  const [profileAvatar, setProfileAvatar] = useState<string>(admin.avatarUrl || '');
  const [profileBadge, setProfileBadge] = useState<BadgeId>((admin.badge as BadgeId) || 'none');
  const [savingProfile, setSavingProfile] = useState(false);
  const profileFileRef = useRef<HTMLInputElement | null>(null);

  // Admin Users Management + Broadcast + Audit Log
  const [users, setUsers] = useState<UserAccountSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditEntry[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserAccountSummary | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  // Broadcast message form
  const [msgTargetId, setMsgTargetId] = useState<string>('all');
  const [msgSeverity, setMsgSeverity] = useState<'info' | 'success' | 'warning'>('info');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Preferences
  const [localAppName, setLocalAppName] = useState(appName);
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD HH:mm');

  // Password change & sessions
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessions, setSessions] = useState<
    Array<{ id: number; user_agent: string; ip_address: string; remember_me?: number; last_seen_at: string; created_at?: string }>
  >([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [loginHistory, setLoginHistory] = useState<
    Array<{
      id: number;
      username: string;
      event_type?: string;
      success: number;
      ip_address: string;
      user_agent?: string;
      reason: string;
      created_at: string;
    }>
  >([]);
  const [revokingSessions, setRevokingSessions] = useState(false);

  // Health
  const [health, setHealth] = useState<HealthInfo | null>(null);

  // Backup Restore
  const [restoreJsonText, setRestoreJsonText] = useState<string | null>(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  useEffect(() => {
    setProfileName(admin.displayName);
    setProfileAvatar(admin.avatarUrl || '');
    setProfileBadge((admin.badge as BadgeId) || 'none');
  }, [admin.displayName, admin.avatarUrl, admin.badge]);

  useEffect(() => {
    apiFetch<{ app_name: string; timezone: string; date_format: string }>('/api/settings').then((res) => {
      setLocalAppName(res.app_name);
      setTimezone(res.timezone);
      setDateFormat(res.date_format);
    });
  }, []);

  const loadAdminUsersAndAudit = async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const [usersRes, auditRes] = await Promise.all([
        apiFetch<{ users: UserAccountSummary[] }>('/api/admin/users'),
        apiFetch<{ logs: AdminAuditEntry[] }>('/api/admin/audit-logs'),
      ]);
      setUsers(usersRes.users);
      setAuditLogs(auditRes.logs);
    } catch (err) {
      onToast('error', 'Failed to load user management', err instanceof Error ? err.message : undefined);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadSecurityData = async () => {
    try {
      const res = await apiFetch<{ currentSessionId: number; sessions: typeof sessions; loginHistory: typeof loginHistory }>(
        '/api/auth/sessions'
      );
      setCurrentSessionId(res.currentSessionId);
      setSessions(res.sessions);
      setLoginHistory(res.loginHistory);
    } catch {
      // ignore transient error
    }
  };

  useEffect(() => {
    if (subTab === 'users' && isAdmin) {
      loadAdminUsersAndAudit();
    } else if (subTab === 'security') {
      loadSecurityData();
    } else if (subTab === 'health') {
      apiFetch<HealthInfo>('/api/system/health').then(setHealth);
    }
  }, [subTab, isAdmin]);

  const handleProfileAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const jpeg = await prepareSquareAvatarJpeg(file, 112, 0.74);
      setProfileAvatar(jpeg);
    } catch (err) {
      onToast('error', 'Photo Upload Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiFetch<{ ok: boolean; admin: AdminUser }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: profileName.trim(),
          avatarDataUrl: profileAvatar || '',
          badge: profileBadge,
        }),
      });
      onAdminUpdated(res.admin);
      onRefreshAll();
      onToast('success', 'Profile Updated', 'Your name, photo, and verified badge have been saved.');
    } catch (err) {
      onToast('error', 'Profile Update Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleBlockUser = async (target: UserAccountSummary) => {
    setBusyUserId(target.id);
    try {
      const res = await apiFetch<{ ok: boolean; isBlocked: boolean }>(`/api/admin/users/${target.id}/block`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked: !target.isBlocked }),
      });
      onToast(
        'success',
        res.isBlocked ? 'User Blocked' : 'User Unblocked',
        `@${target.username} is now ${res.isBlocked ? 'blocked from login' : 'active'}.`
      );
      await loadAdminUsersAndAudit();
    } catch (err) {
      onToast('error', 'Action Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleRole = async (target: UserAccountSummary) => {
    setBusyUserId(target.id);
    const nextRole = target.role === 'admin' ? 'user' : 'admin';
    try {
      await apiFetch(`/api/admin/users/${target.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      onToast(
        'success',
        nextRole === 'admin' ? 'Promoted to Admin' : 'Admin Access Revoked',
        `@${target.username} now has ${nextRole} permissions.`
      );
      await loadAdminUsersAndAudit();
    } catch (err) {
      onToast('error', 'Role Change Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setBusyUserId(deleteUserTarget.id);
    try {
      await apiFetch(`/api/admin/users/${deleteUserTarget.id}`, { method: 'DELETE' });
      onToast('success', 'Account Deleted', `Removed @${deleteUserTarget.username} permanently.`);
      setDeleteUserTarget(null);
      await loadAdminUsersAndAudit();
    } catch (err) {
      onToast('error', 'Delete Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgTitle.trim() || !msgBody.trim()) {
      onToast('error', 'Missing Message Fields', 'Enter both a title and message body.');
      return;
    }
    setSendingBroadcast(true);
    try {
      await apiFetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: msgTitle.trim(),
          message: msgBody.trim(),
          severity: msgSeverity,
          targetUserId: msgTargetId === 'all' ? null : Number(msgTargetId),
        }),
      });
      setMsgTitle('');
      setMsgBody('');
      onToast('success', 'Notification Sent', 'Message delivered to user inbox.');
      await loadAdminUsersAndAudit();
      onRefreshAll();
    } catch (err) {
      onToast('error', 'Broadcast Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        app_name: localAppName,
        default_theme: theme,
        timezone,
        date_format: dateFormat,
      }),
    });
    onAppNameChange(localAppName);
    onToast('success', 'Settings Saved', 'Application preferences persisted.');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      onToast('success', 'Password Updated', 'Account password rotated.');
    } catch (err) {
      onToast('error', 'Password Change Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRestoreJsonText(String(reader.result || ''));
      setConfirmRestoreOpen(true);
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!restoreJsonText) return;
    try {
      const parsed = JSON.parse(restoreJsonText);
      const res = await apiFetch<{ message: string }>('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      onToast('success', 'Backup Restored', res.message);
      setConfirmRestoreOpen(false);
      setRestoreJsonText(null);
      onRefreshAll();
    } catch (err) {
      onToast('error', 'Restore Failed', err instanceof Error ? err.message : 'Invalid backup file.');
      setConfirmRestoreOpen(false);
    }
  };

  const tabs = [
    { id: 'profile' as const, label: 'My Profile', icon: UserCircle2 },
    ...(isAdmin ? [{ id: 'users' as const, label: 'Users & Admin', icon: Users }] : []),
    { id: 'settings' as const, label: 'Preferences', icon: Settings },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'health' as const, label: 'System Health', icon: Activity },
    { id: 'backup' as const, label: 'Backup & Restore', icon: Database },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 w-fit max-w-full">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3.5 py-2 min-h-[38px] text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                subTab === t.id ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white' : 'text-[#73798C] dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* MY PROFILE & VERIFIED BADGE */}
      {subTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Profile Showcase */}
          <div className="lg:col-span-5 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold">Profile Showcase</h2>
            <div className="p-4 rounded-2xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 flex items-center gap-4">
              <UserAvatar
                avatarUrl={profileAvatar || null}
                displayName={profileName || admin.displayName}
                username={admin.username}
                badge={profileBadge}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span data-no-smallcaps="true" className="font-display font-bold text-base truncate">{profileName || admin.displayName}</span>
                  <VerifiedBadgeIcon badge={profileBadge} showLabel size="sm" />
                </div>
                <div data-no-smallcaps="true" className="text-xs font-mono text-[#73798C] dark:text-slate-400 mt-0.5">
                  @{admin.username}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <StatusBadge
                    status={admin.role === 'admin' ? 'accent' : 'neutral'}
                    label={admin.role === 'admin' ? 'Administrator' : 'Standard User'}
                  />
                  {admin.createdIp && (
                    <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                      IP: {admin.createdIp}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-[#73798C] dark:text-slate-400 leading-relaxed">
              Customize your display name, profile photo, and verified badge. Any changes to your profile are automatically reported to the console Administrator.
            </p>
          </div>

          {/* Profile Editor */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-7 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <h2 className="text-sm font-semibold">Edit Profile & Verified Badge</h2>

            <div className="flex flex-wrap items-center gap-4">
              <UserAvatar
                avatarUrl={profileAvatar || null}
                displayName={profileName || admin.displayName}
                username={admin.username}
                badge={profileBadge}
                size="lg"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => profileFileRef.current?.click()}
                  className="px-3.5 py-2 min-h-[40px] rounded-xl bg-[#6555E8]/10 dark:bg-[#7565F6]/15 text-[#6555E8] dark:text-[#A599FF] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{profileAvatar ? 'Change Photo' : 'Upload Photo'}</span>
                </button>
                {profileAvatar && (
                  <button
                    type="button"
                    onClick={() => setProfileAvatar('')}
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] text-xs font-medium"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={profileFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfileAvatarChange}
                  className="sr-only"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profile-display-name" className="block text-xs font-medium mb-1">
                Display Name
              </label>
              <input
                id="profile-display-name"
                type="text"
                required
                minLength={2}
                maxLength={64}
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
              />
            </div>

            <div>
              <span className="block text-xs font-medium mb-2">Select Verified Badge</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VERIFIED_BADGE_OPTIONS.map((opt) => {
                  const selected = profileBadge === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setProfileBadge(opt.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-[#7565F6] bg-[#6555E8]/10 dark:bg-[#7565F6]/15 ring-1 ring-[#7565F6]'
                          : 'border-[#E8EAF1] dark:border-slate-800 bg-[#F6F7FB] dark:bg-[#101421] hover:border-slate-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        {opt.id !== 'none' && <VerifiedBadgeIcon badge={opt.id} size="sm" />}
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <div className="text-[10px] text-[#73798C] dark:text-slate-400 mt-0.5 truncate">
                        {opt.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold disabled:opacity-50"
            >
              {savingProfile ? 'Saving Profile...' : 'Save Profile Changes'}
            </button>
          </form>
        </div>
      )}

      {/* ADMIN USER MANAGEMENT, BROADCAST & AUDIT LOG */}
      {subTab === 'users' && isAdmin && (
        <div className="space-y-5">
          {/* Broadcast Notification / Message to Users */}
          <form
            onSubmit={handleSendBroadcast}
            className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#22C8F6]" />
              <h2 className="text-sm font-semibold">Send Message / Notification to Users</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="broadcast-target" className="block text-xs font-medium mb-1">
                  Recipient
                </label>
                <select
                  id="broadcast-target"
                  value={msgTargetId}
                  onChange={(e) => setMsgTargetId(e.target.value)}
                  className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="all">All Registered Users</option>
                  {users
                    .filter((u) => u.id !== admin.id)
                    .map((u) => (
                      <option key={u.id} value={String(u.id)} data-no-smallcaps="true">
                        {u.displayName} (@{u.username})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="broadcast-severity" className="block text-xs font-medium mb-1">
                  Priority / Style
                </label>
                <select
                  id="broadcast-severity"
                  value={msgSeverity}
                  onChange={(e) => setMsgSeverity(e.target.value as 'info' | 'success' | 'warning')}
                  className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="info">Information</option>
                  <option value="success">Announcement / Success</option>
                  <option value="warning">Important Alert</option>
                </select>
              </div>
              <div>
                <label htmlFor="broadcast-title" className="block text-xs font-medium mb-1">
                  Title
                </label>
                <input
                  id="broadcast-title"
                  type="text"
                  required
                  value={msgTitle}
                  onChange={(e) => setMsgTitle(e.target.value)}
                  placeholder="System Notice"
                  className="w-full px-3.5 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                />
              </div>
            </div>

            <div>
              <label htmlFor="broadcast-message" className="block text-xs font-medium mb-1">
                Message Content
              </label>
              <textarea
                id="broadcast-message"
                rows={2}
                required
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                placeholder="Write a notification message for users..."
                className="w-full p-3 text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={sendingBroadcast}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingBroadcast ? 'Sending...' : 'Send Notification'}</span>
            </button>
          </form>

          {/* Registered Users Management */}
          <section className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Registered Users ({users.length})</h2>
                <p className="text-xs text-[#73798C] dark:text-slate-400">
                  Block/unblock accounts, grant or revoke Admin access, or delete registered users.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAdminUsersAndAudit}
                className="px-3 py-1.5 rounded-xl border border-[#E8EAF1] dark:border-slate-800 text-xs font-medium"
              >
                {usersLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <div className="space-y-2.5">
              {users.map((u) => {
                const isSelf = u.id === admin.id;
                const busy = busyUserId === u.id;
                return (
                  <div
                    key={u.id}
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      u.isBlocked
                        ? 'border-[#F05B75]/35 bg-[#F05B75]/5'
                        : 'border-[#E8EAF1] dark:border-slate-800 bg-[#F6F7FB] dark:bg-[#101421]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        avatarUrl={u.avatarUrl}
                        displayName={u.displayName}
                        username={u.username}
                        badge={u.badge}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span data-no-smallcaps="true" className="text-xs font-semibold truncate">{u.displayName}</span>
                          <VerifiedBadgeIcon badge={u.badge} size="xs" />
                          <span data-no-smallcaps="true" className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">@{u.username}</span>
                          {isSelf && <StatusBadge status="accent" label="You" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                          <StatusBadge
                            status={u.role === 'admin' ? 'accent' : 'neutral'}
                            label={u.role === 'admin' ? 'Admin' : 'User'}
                          />
                          <StatusBadge
                            status={u.isBlocked ? 'danger' : 'success'}
                            label={u.isBlocked ? 'Blocked' : 'Active'}
                          />
                          {u.createdIp && <span className="font-mono text-[#73798C]">IP {u.createdIp}</span>}
                        </div>
                      </div>
                    </div>

                    {!isSelf && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleBlockUser(u)}
                          className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border transition-colors ${
                            u.isBlocked
                              ? 'border-[#20C997]/40 text-[#20C997] hover:bg-[#20C997]/10'
                              : 'border-[#F5B942]/40 text-[#F5B942] hover:bg-[#F5B942]/10'
                          }`}
                        >
                          {u.isBlocked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          <span>{u.isBlocked ? 'Unblock' : 'Block'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleRole(u)}
                          className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border transition-colors ${
                            u.role === 'admin'
                              ? 'border-slate-500/40 text-slate-300 hover:bg-slate-500/10'
                              : 'border-[#7565F6]/40 text-[#6555E8] dark:text-[#A599FF] hover:bg-[#7565F6]/10'
                          }`}
                        >
                          {u.role === 'admin' ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          <span>{u.role === 'admin' ? 'Remove Admin' : 'Promote to Admin'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeleteUserTarget(u)}
                          aria-label={`Delete ${u.username}`}
                          className="px-3 py-1.5 min-h-[36px] rounded-xl border border-[#F05B75]/35 text-[#F05B75] hover:bg-[#F05B75]/10 text-xs font-medium inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Admin Audit Log (Chronological Activity Feed) */}
          <section className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#7565F6]" />
              <div>
                <h2 className="text-sm font-semibold">Admin Audit Log</h2>
                <p className="text-xs text-[#73798C] dark:text-slate-400">
                  Chronological record of account deletions, blocking, admin promotions, and broadcasts (newest first).
                </p>
              </div>
            </div>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-[#73798C] dark:text-slate-400 py-4 text-center">
                No administrative user actions recorded yet.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {auditLogs.map((entry) => {
                  const badgeInfo = AUDIT_ACTION_BADGE[entry.action_type] || {
                    label: entry.action_type,
                    cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
                  };
                  return (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 flex items-start gap-3 text-xs"
                    >
                      <UserAvatar
                        avatarUrl={entry.admin_avatar}
                        displayName={entry.admin_display_name}
                        username={entry.admin_username}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span data-no-smallcaps="true" className="font-semibold text-[#171A2B] dark:text-slate-100">
                              {entry.admin_display_name}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${badgeInfo.cls}`}>
                              {badgeInfo.label}
                            </span>
                            {entry.affected_username && (
                              <span data-no-smallcaps="true" className="font-mono text-[11px] text-[#73798C] dark:text-slate-400">
                                → {entry.affected_display_name || entry.affected_username} (@{entry.affected_username})
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-[#73798C] dark:text-slate-500 shrink-0">
                            {entry.created_at}
                          </span>
                        </div>
                        <p className="text-[#73798C] dark:text-slate-300">{entry.details}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {subTab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4 max-w-xl"
        >
          <h2 className="text-sm font-semibold">Application & Theme Preferences</h2>
          <div>
            <label className="block text-xs font-medium mb-1">Console Brand Name</label>
            <input
              type="text"
              value={localAppName}
              onChange={(e) => setLocalAppName(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Theme Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {(['dark', 'light', 'system'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSetTheme(m)}
                  className={`py-2.5 min-h-[44px] rounded-xl border text-xs font-medium capitalize ${
                    theme === m
                      ? 'border-[#7565F6] bg-[#6555E8]/10 text-[#6555E8] dark:text-[#A599FF]'
                      : 'border-[#E8EAF1] dark:border-slate-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              >
                <option value="UTC">UTC</option>
                <option value="Asia/Dhaka">Asia/Dhaka (UTC+6)</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date Format</label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              >
                <option value="YYYY-MM-DD HH:mm">YYYY-MM-DD HH:mm</option>
                <option value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:mm</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-semibold"
          >
            Save Preferences
          </button>
        </form>
      )}

      {subTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <form
            onSubmit={handleChangePassword}
            className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#7565F6]" />
              <span>Change Account Password</span>
            </h3>
            <div>
              <label className="block text-xs font-medium mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">New Password (min 8 chars)</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-semibold"
            >
              Update Password
            </button>
          </form>

          <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#7565F6]" />
                  <span>Active Sessions & Remote Logout</span>
                </h3>
                <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-0.5">
                  Log out unrecognized devices immediately to protect your account.
                </p>
              </div>
              <button
                type="button"
                disabled={revokingSessions}
                onClick={async () => {
                  setRevokingSessions(true);
                  try {
                    const res = await apiFetch<{ ok: boolean; revokedCount: number; csrfToken?: string }>(
                      '/api/auth/sessions/revoke-others',
                      { method: 'POST' }
                    );
                    if (res.csrfToken) setCsrfToken(res.csrfToken);
                    await loadSecurityData();
                    onToast(
                      'success',
                      'Other Devices Logged Out',
                      res.revokedCount > 0
                        ? `Remotely signed out ${res.revokedCount} other session(s).`
                        : 'All previous session tokens have been invalidated.'
                    );
                  } catch (err) {
                    onToast('error', 'Remote Logout Failed', err instanceof Error ? err.message : undefined);
                  } finally {
                    setRevokingSessions(false);
                  }
                }}
                className="px-3 py-1.5 min-h-[36px] rounded-xl text-[11px] font-semibold text-[#F05B75] bg-[#F05B75]/10 border border-[#F05B75]/30 hover:bg-[#F05B75]/15 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out All Other Devices</span>
              </button>
            </div>

            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-xs text-[#73798C] dark:text-slate-400 py-2">No active session records found.</p>
              ) : (
                sessions.map((s) => {
                  const isCurrent = s.id === currentSessionId;
                  const isMobile = isMobileUserAgent(s.user_agent);
                  const deviceLabel = formatDeviceSummary(s.user_agent);
                  return (
                    <div
                      key={s.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                        isCurrent
                          ? 'bg-[#20C997]/6 border-[#20C997]/30'
                          : 'bg-[#F6F7FB] dark:bg-[#101421] border-[#E8EAF1] dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            isCurrent
                              ? 'bg-[#20C997]/15 text-[#20C997]'
                              : 'bg-[#7565F6]/12 text-[#7565F6] dark:text-[#A599FF]'
                          }`}
                        >
                          {isMobile ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-[#171A2B] dark:text-slate-100">{deviceLabel}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded-full bg-[#20C997]/15 text-[#118A66] dark:text-[#20C997] text-[10px] font-semibold">
                                Current Device
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                            <span data-no-smallcaps="true" className="inline-flex items-center gap-1 text-[#22C8F6]">
                              <Globe className="w-3 h-3" />
                              {s.ip_address || 'Unknown IP'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {s.last_seen_at}
                            </span>
                          </div>
                        </div>
                      </div>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                              onToast('success', 'Device Logged Out', `Session from ${s.ip_address} was signed out.`);
                              await loadSecurityData();
                            } catch (err) {
                              onToast('error', 'Failed to Log Out Device', err instanceof Error ? err.message : undefined);
                            }
                          }}
                          className="px-2.5 py-1.5 min-h-[34px] rounded-lg text-[11px] font-semibold text-[#F05B75] border border-[#F05B75]/30 hover:bg-[#F05B75]/10 inline-flex items-center gap-1 shrink-0"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>Log Out</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 border-t border-[#E8EAF1] dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 text-[#171A2B] dark:text-slate-100">
                  <History className="w-3.5 h-3.5 text-[#7565F6]" />
                  <span>Login & Logout Activity Log</span>
                </h4>
                <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                  {loginHistory.length} events
                </span>
              </div>

              {loginHistory.length === 0 ? (
                <p className="text-xs text-[#73798C] dark:text-slate-400 py-2">No login or logout events recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {loginHistory.map((h) => {
                    const evt = h.event_type || (h.success ? 'login' : 'login_failed');
                    const isLogin = evt === 'login';
                    const isLogout = evt === 'logout';
                    const isRevoked = evt === 'session_revoked';
                    const badgeStyle = isLogin
                      ? { label: 'Sign In', cls: 'bg-[#20C997]/15 text-[#118A66] dark:text-[#20C997] border-[#20C997]/30', Icon: LogIn }
                      : isLogout
                      ? { label: 'Sign Out', cls: 'bg-[#22C8F6]/15 text-[#0E8BB2] dark:text-[#22C8F6] border-[#22C8F6]/30', Icon: LogOut }
                      : isRevoked
                      ? { label: 'Remote Logout', cls: 'bg-[#F5B942]/15 text-[#C68A12] dark:text-[#F5B942] border-[#F5B942]/30', Icon: ShieldAlert }
                      : { label: 'Failed', cls: 'bg-[#F05B75]/15 text-[#F05B75] border-[#F05B75]/30', Icon: ShieldAlert };
                    const EventIcon = badgeStyle.Icon;

                    return (
                      <div
                        key={h.id}
                        className="p-2.5 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800/80 flex items-start justify-between gap-2.5 text-xs"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${badgeStyle.cls}`}>
                            <EventIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${badgeStyle.cls}`}>
                                {badgeStyle.label}
                              </span>
                              <span data-no-smallcaps="true" className="font-mono text-[11px] font-medium text-[#171A2B] dark:text-slate-100">
                                @{h.username}
                              </span>
                              <span className="text-[11px] text-[#73798C] dark:text-slate-400">· {h.reason}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-mono text-[#73798C] dark:text-slate-500">
                              <span>{formatDeviceSummary(h.user_agent)}</span>
                              <span data-no-smallcaps="true" className="text-[#22C8F6]">
                                {h.ip_address || 'Unknown IP'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-[#73798C] dark:text-slate-500 shrink-0">
                          {h.created_at}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'health' && (
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-5">
          <h2 className="text-sm font-semibold">System Health Monitor</h2>
          {health && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#F6F7FB] dark:bg-[#101421]">
                  <div className="text-[#73798C]">Runtime Engine</div>
                  <div className="font-mono font-semibold mt-1">{health.runtime}</div>
                  {health.deploymentMode && (
                    <div className="text-[11px] text-[#73798C] mt-0.5">{health.deploymentMode}</div>
                  )}
                </div>
                <div className="p-3.5 rounded-xl bg-[#F6F7FB] dark:bg-[#101421]">
                  <div className="text-[#73798C]">Database Status</div>
                  <div className="font-mono font-semibold mt-1 text-[#20C997]">
                    {health.databaseEngine} · {health.tableCount} tables ({health.dbSizeKb} KB)
                  </div>
                  {health.storageMode && (
                    <div className="text-[11px] text-[#73798C] mt-0.5">{health.storageMode}</div>
                  )}
                </div>
                <div className="p-3.5 rounded-xl bg-[#F6F7FB] dark:bg-[#101421]">
                  <div className="text-[#73798C]">Token Vault Cipher</div>
                  <div className="font-mono font-semibold mt-1">{health.encryptionAlgorithm}</div>
                  <div className="text-[11px] mt-0.5">
                    {health.explicitMasterKeyConfigured ? (
                      <span className="text-[#20C997]">XC_MASTER_KEY configured</span>
                    ) : (
                      <span className="text-[#F5B942]">Set XC_MASTER_KEY in env</span>
                    )}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F6F7FB] dark:border-slate-800 dark:bg-[#101421]">
                  <div className="text-[#73798C]">Webhook Receiver</div>
                  <div className="font-mono font-semibold mt-1 text-[#20C997]">
                    {health.webhookEndpointReady ? 'Ready' : 'Offline'} ({health.httpsActive ? 'HTTPS' : 'Proxy HTTP'})
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-[#73798C] mb-2">Latest Application / API Errors</h3>
                {health.recentErrors.length === 0 ? (
                  <p className="text-xs text-[#20C997]">Zero recent errors recorded.</p>
                ) : (
                  <div className="space-y-1.5 text-xs">
                    {health.recentErrors.map((e, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-[#F05B75]/8 border border-[#F05B75]/20 flex justify-between gap-2">
                        <span className="font-mono">
                          {e.method} ({e.http_status}): {e.error_message}
                        </span>
                        <span className="font-mono text-[#73798C] shrink-0">{e.created_at}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'backup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Export Console Backup</h3>
            <p className="text-xs text-[#73798C] dark:text-slate-400">
              Exports bot configurations, commands, keyboard templates, saved API requests, and settings with a SHA-256 integrity checksum. Unencrypted Bot Tokens are never included in backups.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <a
                href="/api/backup/export"
                download
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Export Safe JSON Backup</span>
              </a>
              <a
                href="/api/backup/sql-schema"
                download
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-2"
              >
                <Database className="w-4 h-4" />
                <span>Download SQL Schema</span>
              </a>
            </div>
          </div>

          <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Restore from JSON Backup</h3>
            <p className="text-xs text-[#73798C] dark:text-slate-400">
              Upload a previously exported XC BOT CONTROL JSON backup. The server verifies the SHA-256 checksum before restoring settings, templates, and saved requests.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-[#7565F6] text-xs font-semibold text-[#6555E8] dark:text-[#A599FF] cursor-pointer hover:bg-[#7565F6]/5">
              <Upload className="w-4 h-4" />
              <span>Select Backup JSON File</span>
              <input type="file" accept=".json,application/json" onChange={handleFileSelect} className="sr-only" />
            </label>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRestoreOpen}
        onClose={() => setConfirmRestoreOpen(false)}
        onConfirm={handleConfirmRestore}
        title="Verify & Restore Backup?"
        message="This will verify the SHA-256 integrity checksum of your uploaded backup file and restore settings, keyboard templates, and saved API presets."
        confirmLabel="Verify & Restore"
      />

      <ConfirmDialog
        open={Boolean(deleteUserTarget)}
        onClose={() => setDeleteUserTarget(null)}
        onConfirm={handleConfirmDeleteUser}
        danger
        loading={busyUserId !== null}
        title={`Delete @${deleteUserTarget?.username}?`}
        message={`This permanently removes ${deleteUserTarget?.displayName}'s account and active sessions. This action will be recorded in the Admin Audit Log.`}
        confirmLabel="Delete Account"
      />
    </div>
  );
}

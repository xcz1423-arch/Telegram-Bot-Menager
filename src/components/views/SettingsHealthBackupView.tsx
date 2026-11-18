import React, { useEffect, useState } from 'react';
import {
  Settings,
  Shield,
  Activity,
  Download,
  Upload,
  KeyRound,
  LogOut,
  Database,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { ThemeMode } from '../../types';
import { ConfirmDialog, StatusBadge } from '../ui/Primitives';

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

export function SettingsHealthBackupView({
  theme,
  onSetTheme,
  appName,
  onAppNameChange,
  onRefreshAll,
  onToast,
}: {
  theme: ThemeMode;
  onSetTheme: (t: ThemeMode) => void;
  appName: string;
  onAppNameChange: (name: string) => void;
  onRefreshAll: () => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const [subTab, setSubTab] = useState<'settings' | 'security' | 'health' | 'backup'>('settings');
  const [localAppName, setLocalAppName] = useState(appName);
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD HH:mm');

  // Password change & sessions
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessions, setSessions] = useState<Array<{ id: number; user_agent: string; ip_address: string; last_seen_at: string }>>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [loginHistory, setLoginHistory] = useState<Array<{ id: number; username: string; success: number; ip_address: string; reason: string; created_at: string }>>([]);

  // Health
  const [health, setHealth] = useState<HealthInfo | null>(null);

  // Backup Restore
  const [restoreJsonText, setRestoreJsonText] = useState<string | null>(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ app_name: string; timezone: string; date_format: string }>('/api/settings').then((res) => {
      setLocalAppName(res.app_name);
      setTimezone(res.timezone);
      setDateFormat(res.date_format);
    });
  }, []);

  useEffect(() => {
    if (subTab === 'security') {
      apiFetch<{ currentSessionId: number; sessions: typeof sessions; loginHistory: typeof loginHistory }>('/api/auth/sessions').then(
        (res) => {
          setCurrentSessionId(res.currentSessionId);
          setSessions(res.sessions);
          setLoginHistory(res.loginHistory);
        }
      );
    } else if (subTab === 'health') {
      apiFetch<HealthInfo>('/api/system/health').then(setHealth);
    }
  }, [subTab]);

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
      onToast('success', 'Password Updated', 'Administrator password rotated.');
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 w-fit">
        {[
          { id: 'settings' as const, label: 'Preferences', icon: Settings },
          { id: 'security' as const, label: 'Admin Security', icon: Shield },
          { id: 'health' as const, label: 'System Health', icon: Activity },
          { id: 'backup' as const, label: 'Backup & Restore', icon: Database },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3.5 py-2 min-h-[38px] text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${
                subTab === t.id ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white' : 'text-[#73798C] dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

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
              <span>Change Administrator Password</span>
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

          <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Active Sessions & Login History</h3>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono truncate">{s.ip_address} · {s.id === currentSessionId ? 'Current Session' : 'Session'}</div>
                    <div className="text-[11px] text-[#73798C] truncate">{s.user_agent}</div>
                  </div>
                  {s.id !== currentSessionId && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                        setSessions(sessions.filter((x) => x.id !== s.id));
                      }}
                      className="px-2.5 py-1 rounded-lg text-[#F05B75] border border-[#F05B75]/30 inline-flex items-center gap-1"
                    >
                      <LogOut className="w-3 h-3" /> Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#E8EAF1] dark:border-slate-800 space-y-1.5 max-h-48 overflow-y-auto">
              {loginHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate">
                    {h.username} · {h.reason}
                  </span>
                  <StatusBadge status={h.success ? 'success' : 'danger'} label={h.success ? 'OK' : 'Failed'} />
                </div>
              ))}
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
    </div>
  );
}

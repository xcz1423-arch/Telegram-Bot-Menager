import React, { useState } from 'react';
import {
  Bot,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Send,
  Users,
  TerminalSquare,
  Grid2x2,
  Webhook,
  Code2,
  Sliders,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { BotSummary, NavTab } from '../../types';
import { ConfirmDialog, EmptyState, Modal, StatusBadge } from '../ui/Primitives';

export function AddBotModal({
  open,
  onClose,
  onBotAdded,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onBotAdded: (bot: BotSummary) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const [token, setToken] = useState('');
  const [customName, setCustomName] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    mode: 'live' | 'sandbox';
    token_masked: string;
    profile: {
      id: number;
      first_name: string;
      username: string;
      can_join_groups: boolean;
      supports_inline_queries: boolean;
    };
  } | null>(null);

  const reset = () => {
    setToken('');
    setCustomName('');
    setShortDesc('');
    setPreview(null);
    setError(null);
  };

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidating(true);
    try {
      const res = await apiFetch<typeof preview & { ok: boolean }>('/api/bots/validate-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setPreview(res);
      if (!customName && res.profile?.first_name) {
        setCustomName(res.profile.first_name);
      }
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Token validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; bot: BotSummary }>('/api/bots', {
        method: 'POST',
        body: JSON.stringify({ token, name: customName, short_description: shortDesc }),
      });
      onToast('success', 'Bot Connected', `@${res.bot.username} encrypted with AES-256-GCM and saved.`);
      onBotAdded(res.bot);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bot.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Connect Telegram Bot"
      subtitle="Tokens are validated via getMe and stored with server-side AES-256-GCM encryption"
    >
      <div className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-[#F05B75]/10 border border-[#F05B75]/30 text-xs text-[#C72544] dark:text-[#F05B75]">
            {error}
          </div>
        )}

        <form onSubmit={handleValidate} className="space-y-3">
          <div>
            <label htmlFor="new-bot-token" className="block text-xs font-medium mb-1.5">
              Telegram Bot Token
            </label>
            <input
              id="new-bot-token"
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setPreview(null);
              }}
              placeholder="123456789:AAH... or sandbox:my_test_bot"
              className="w-full px-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
            />
            <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-1">
              Paste a live @BotFather token or use <code className="font-mono">sandbox:custom_name</code> to test locally without Telegram credentials.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={validating}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {validating ? 'Validating via getMe...' : 'Validate Token'}
            </button>
            <button
              type="button"
              onClick={() => {
                setToken(`sandbox:relay_${Math.floor(100 + Math.random() * 899)}`);
                setPreview(null);
                setError(null);
              }}
              className="px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Generate Sandbox Token
            </button>
          </div>
        </form>

        {preview && (
          <div className="p-4 rounded-xl bg-[#20C997]/8 border border-[#20C997]/30 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#118A66] dark:text-[#20C997]">
                <CheckCircle2 className="w-4 h-4" />
                <span>getMe Profile Verified ({preview.mode})</span>
              </div>
              <span className="font-mono text-[11px] text-[#73798C] dark:text-slate-400">{preview.token_masked}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[#73798C] dark:text-slate-400">Username:</span>{' '}
                <span className="font-mono font-medium">@{preview.profile.username}</span>
              </div>
              <div>
                <span className="text-[#73798C] dark:text-slate-400">Bot ID:</span>{' '}
                <span className="font-mono font-medium">{preview.profile.id}</span>
              </div>
            </div>

            <div>
              <label htmlFor="bot-display-name" className="block text-xs font-medium mb-1">
                Console Display Name
              </label>
              <input
                id="bot-display-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-white dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>

            <div>
              <label htmlFor="bot-short-desc" className="block text-xs font-medium mb-1">
                Notes / Short Description
              </label>
              <input
                id="bot-short-desc"
                type="text"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                placeholder="Production order alerts..."
                className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-white dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#20C997] hover:bg-[#18b184] text-[#090B14] text-xs font-bold transition-colors disabled:opacity-50"
            >
              {saving ? 'Encrypting & Saving...' : 'Save & Connect Bot'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function BotsView({
  bots,
  activeBotId,
  onSelectBot,
  onNavigate,
  onOpenAddBot,
  onRefresh,
  onToast,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (id: number | null) => void;
  onNavigate: (tab: NavTab) => void;
  onOpenAddBot: () => void;
  onRefresh: () => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const selectedBot = bots.find((b) => b.id === activeBotId) || bots[0] || null;
  const [subTab, setSubTab] = useState<'overview' | 'edit' | 'settings'>('overview');
  const [editName, setEditName] = useState(selectedBot?.name || '');
  const [editShort, setEditShort] = useState(selectedBot?.short_description || '');
  const [editDescription, setEditDescription] = useState(selectedBot?.description || '');
  const [syncTelegram, setSyncTelegram] = useState(true);
  const [editStatus, setEditStatus] = useState<'connected' | 'disconnected'>(
    selectedBot?.connection_status === 'disconnected' ? 'disconnected' : 'connected'
  );
  const [parseMode, setParseMode] = useState<'HTML' | 'MarkdownV2' | 'None'>(
    selectedBot?.settings?.default_parse_mode || 'HTML'
  );
  const [disableNotif, setDisableNotif] = useState(Boolean(selectedBot?.settings?.disable_notification));
  const [protectContent, setProtectContent] = useState(Boolean(selectedBot?.settings?.protect_content));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BotSummary | null>(null);

  React.useEffect(() => {
    if (selectedBot) {
      setEditName(selectedBot.name);
      setEditShort(selectedBot.short_description || '');
      setEditDescription(selectedBot.description || '');
      setEditStatus(selectedBot.connection_status === 'disconnected' ? 'disconnected' : 'connected');
      setParseMode(selectedBot.settings?.default_parse_mode || 'HTML');
      setDisableNotif(Boolean(selectedBot.settings?.disable_notification));
      setProtectContent(Boolean(selectedBot.settings?.protect_content));
    }
  }, [
    selectedBot?.id,
    selectedBot?.name,
    selectedBot?.short_description,
    selectedBot?.description,
    selectedBot?.connection_status,
  ]);

  const handleTestConnection = async (bot: BotSummary) => {
    setBusyAction('test');
    try {
      const res = await apiFetch<{ ok: boolean; durationMs: number }>(`/api/bots/${bot.id}/test-connection`, {
        method: 'POST',
      });
      onToast(
        res.ok ? 'success' : 'error',
        res.ok ? 'Connection Healthy' : 'Connection Failed',
        `getMe responded in ${res.durationMs}ms`
      );
      onRefresh();
    } catch (err) {
      onToast('error', 'Test Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevalidate = async (bot: BotSummary) => {
    setBusyAction('revalidate');
    try {
      await apiFetch(`/api/bots/${bot.id}/revalidate`, { method: 'POST' });
      onToast('success', 'Token Revalidated', `@${bot.username} profile synced.`);
      onRefresh();
    } catch (err) {
      onToast('error', 'Revalidation Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBot) return;
    setBusyAction('save');
    try {
      const res = await apiFetch<{ ok: boolean; syncedMethods?: string[]; bot: BotSummary }>(`/api/bots/${selectedBot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          short_description: editShort,
          description: editDescription,
          connection_status: editStatus,
          sync_telegram: syncTelegram,
        }),
      });
      onToast(
        'success',
        'Bot Profile Updated',
        res.syncedMethods?.length
          ? `Saved & synced with Telegram (${res.syncedMethods.join(', ')}).`
          : 'Configuration saved.'
      );
      onRefresh();
    } catch (err) {
      onToast('error', 'Update Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePullProfile = async () => {
    if (!selectedBot) return;
    setBusyAction('pull');
    try {
      const res = await apiFetch<{ ok: boolean; bot: BotSummary }>(`/api/bots/${selectedBot.id}/sync-profile`, {
        method: 'POST',
      });
      setEditName(res.bot.name);
      setEditShort(res.bot.short_description || '');
      setEditDescription(res.bot.description || '');
      onToast('success', 'Profile Synced', `Loaded current Name & Bio for @${selectedBot.username}.`);
      onRefresh();
    } catch (err) {
      onToast('error', 'Sync Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBot) return;
    setBusyAction('settings');
    try {
      await apiFetch(`/api/bots/${selectedBot.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          default_parse_mode: parseMode,
          disable_notification: disableNotif,
          protect_content: protectContent,
        }),
      });
      onToast('success', 'Settings Saved', `Default parse mode: ${parseMode}`);
      onRefresh();
    } catch (err) {
      onToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyAction('delete');
    try {
      await apiFetch(`/api/bots/${deleteTarget.id}`, { method: 'DELETE' });
      onToast('info', 'Bot Removed', `@${deleteTarget.username} and its encrypted credentials were removed.`);
      if (activeBotId === deleteTarget.id) onSelectBot(null);
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      onToast('error', 'Delete Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  if (bots.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="No Telegram Bots Connected"
        description="Connect your first Telegram bot token (live or sandbox) to manage messages, commands, webhooks, and analytics."
        actionLabel="Connect First Bot"
        onAction={onOpenAddBot}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left Bot List */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Connected Fleet ({bots.length})</h2>
          <button
            type="button"
            onClick={onOpenAddBot}
            className="px-3 py-1.5 min-h-[36px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bot</span>
          </button>
        </div>

        <div className="space-y-2.5">
          {bots.map((b) => {
            const isSelected = selectedBot?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBot(b.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                  isSelected
                    ? 'bg-white dark:bg-[#151B2B] border-[#7565F6]'
                    : 'bg-white dark:bg-[#151B2B] border-[#E8EAF1] dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{b.name}</div>
                    <div className="text-xs font-mono text-[#73798C] dark:text-slate-400 truncate">
                      @{b.username} · {b.mode}
                    </div>
                  </div>
                  <StatusBadge
                    status={b.connection_status === 'connected' ? 'success' : b.connection_status === 'disconnected' ? 'neutral' : 'danger'}
                    label={b.connection_status}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#73798C] dark:text-slate-400">
                  <span>{b.counts?.chats ?? 0} chats</span>
                  <span>·</span>
                  <span>{b.counts?.messages ?? 0} msgs</span>
                  <span>·</span>
                  <span>{b.counts?.updates ?? 0} updates</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Individual Bot Management Workspace */}
      {selectedBot && (
        <div className="lg:col-span-8 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E8EAF1] dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-display font-bold">{selectedBot.name}</h2>
                <StatusBadge
                  status={selectedBot.connection_status === 'connected' ? 'success' : 'warning'}
                  label={selectedBot.connection_status}
                />
              </div>
              <div className="text-xs font-mono text-[#73798C] dark:text-slate-400 mt-1">
                @{selectedBot.username} · ID {selectedBot.telegram_bot_id} · Token {selectedBot.token_masked}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleTestConnection(selectedBot)}
                className="px-3 py-2 min-h-[40px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{busyAction === 'test' ? 'Testing...' : 'Test Connection'}</span>
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleRevalidate(selectedBot)}
                className="px-3 py-2 min-h-[40px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'revalidate' ? 'animate-spin' : ''}`} />
                <span>Revalidate</span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(selectedBot)}
                aria-label={`Remove ${selectedBot.name}`}
                className="px-3 py-2 min-h-[40px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] hover:bg-[#F05B75]/10 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          </div>

          {/* Workspace Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#F6F7FB] dark:bg-[#101421] rounded-xl w-fit">
            {[
              { id: 'overview' as const, label: 'Overview & Modules' },
              { id: 'edit' as const, label: 'Edit Profile' },
              { id: 'settings' as const, label: 'Bot Defaults' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  subTab === t.id
                    ? 'bg-white dark:bg-[#151B2B] text-[#171A2B] dark:text-white shadow-xs'
                    : 'text-[#73798C] dark:text-slate-400 hover:text-[#171A2B] dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {subTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Webhook Status</div>
                  <div className="font-semibold mt-1 capitalize">{selectedBot.webhook_status}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Join Groups</div>
                  <div className="font-semibold mt-1">{selectedBot.can_join_groups ? 'Allowed' : 'Disabled'}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Inline Queries</div>
                  <div className="font-semibold mt-1">{selectedBot.supports_inline_queries ? 'Enabled' : 'Off'}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Encryption</div>
                  <div className="font-semibold mt-1 inline-flex items-center gap-1 text-[#20C997]">
                    <ShieldCheck className="w-3.5 h-3.5" /> AES-256-GCM
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-[#73798C] dark:text-slate-400 mb-2.5">
                  Operate @{selectedBot.username}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { tab: 'messages' as NavTab, label: 'Send Message', icon: Send },
                    { tab: 'chats' as NavTab, label: 'Known Chats', icon: Users },
                    { tab: 'commands' as NavTab, label: 'Bot Commands', icon: TerminalSquare },
                    { tab: 'keyboards' as NavTab, label: 'Keyboards', icon: Grid2x2 },
                    { tab: 'webhooks' as NavTab, label: 'Webhook & Updates', icon: Webhook },
                    { tab: 'explorer' as NavTab, label: 'API Explorer', icon: Code2 },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.tab}
                        type="button"
                        onClick={() => {
                          onSelectBot(selectedBot.id);
                          onNavigate(m.tab);
                        }}
                        className="flex items-center gap-2.5 p-3 min-h-[48px] rounded-xl border border-[#E8EAF1] dark:border-slate-800 hover:border-[#7565F6] hover:bg-[#7565F6]/5 text-xs font-medium transition-colors"
                      >
                        <Icon className="w-4 h-4 text-[#6555E8] dark:text-[#988DF9] shrink-0" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {subTab === 'edit' && (
            <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-bot-name" className="block text-xs font-medium">
                    Bot Name
                  </label>
                  <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                    {editName.length}/64
                  </span>
                </div>
                <input
                  id="edit-bot-name"
                  type="text"
                  required
                  maxLength={64}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-bot-bio" className="block text-xs font-medium">
                    Bot Bio (Short Description)
                  </label>
                  <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                    {editShort.length}/120
                  </span>
                </div>
                <input
                  id="edit-bot-bio"
                  type="text"
                  maxLength={120}
                  value={editShort}
                  onChange={(e) => setEditShort(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
                <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-1">
                  Shown on your bot's Telegram profile page (About / Bio).
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-bot-description" className="block text-xs font-medium">
                    Bot Description (What can this bot do?)
                  </label>
                  <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                    {editDescription.length}/512
                  </span>
                </div>
                <textarea
                  id="edit-bot-description"
                  rows={3}
                  maxLength={512}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
              </div>

              <div>
                <label htmlFor="edit-bot-status" className="block text-xs font-medium mb-1">
                  Operational Status
                </label>
                <select
                  id="edit-bot-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'connected' | 'disconnected')}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="connected">Connected (Active)</option>
                  <option value="disconnected">Disconnected (Paused)</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#73798C] dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncTelegram}
                  onChange={(e) => setSyncTelegram(e.target.checked)}
                />
                <span>Sync Name, Bio & Description directly with Telegram Bot API</span>
              </label>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {busyAction === 'save' ? 'Saving & Syncing...' : 'Save Bot Profile'}
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handlePullProfile}
                  className="px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'pull' ? 'animate-spin' : ''}`} />
                  <span>{busyAction === 'pull' ? 'Syncing...' : 'Pull from Telegram'}</span>
                </button>
              </div>
            </form>
          )}

          {subTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-medium mb-1">Default Parse Mode</label>
                <select
                  value={parseMode}
                  onChange={(e) => setParseMode(e.target.value as 'HTML' | 'MarkdownV2' | 'None')}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="HTML">HTML</option>
                  <option value="MarkdownV2">MarkdownV2</option>
                  <option value="None">Plain Text</option>
                </select>
              </div>
              <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={disableNotif}
                  onChange={(e) => setDisableNotif(e.target.checked)}
                />
                <span>Disable notifications silently by default</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={protectContent}
                  onChange={(e) => setProtectContent(e.target.checked)}
                />
                <span>Protect outgoing message content from forwarding</span>
              </label>
              <button
                type="submit"
                disabled={busyAction === 'settings'}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{busyAction === 'settings' ? 'Saving...' : 'Save Bot Defaults'}</span>
              </button>
            </form>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        loading={busyAction === 'delete'}
        title={`Remove @${deleteTarget?.username}?`}
        message="This removes the bot, its encrypted token, chats, commands, and update history from XC BOT CONTROL."
        confirmLabel="Remove Bot"
      />
    </div>
  );
}

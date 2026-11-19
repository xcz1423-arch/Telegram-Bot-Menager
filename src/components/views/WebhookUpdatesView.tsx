import React, { useEffect, useState } from 'react';
import {
  Webhook,
  RefreshCw,
  Trash2,
  Zap,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldAlert,
  Eye,
  EyeOff,
  Link2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { BotSummary, BotUpdate } from '../../types';
import { CopyButton, EmptyState, StatusBadge } from '../ui/Primitives';

export function WebhookUpdatesView({
  bots,
  activeBotId,
  onSelectBot,
  onRefreshDashboard,
  onToast,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (id: number) => void;
  onRefreshDashboard: () => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const bot = bots.find((b) => b.id === activeBotId) || bots[0] || null;

  const [tab, setTab] = useState<'updates' | 'webhook'>(bot ? 'updates' : 'webhook');
  const [sourceMode, setSourceMode] = useState<'connected' | 'direct'>(bot ? 'connected' : 'direct');
  const [updates, setUpdates] = useState<BotUpdate[]>([]);
  const [updateTotal, setUpdateTotal] = useState(0);
  const [updateFilter, setUpdateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoPoll, setAutoPoll] = useState(false);

  // Connected-bot webhook config state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [secretToken, setSecretToken] = useState('');
  const [webhookInfo, setWebhookInfo] = useState<Record<string, unknown> | null>(null);

  // Direct hosted URL + bot token webhook state
  const [directToken, setDirectToken] = useState('');
  const [showDirectToken, setShowDirectToken] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [directSecret, setDirectSecret] = useState('');
  const [directDropPending, setDirectDropPending] = useState(false);
  const [directWebhookInfo, setDirectWebhookInfo] = useState<Record<string, unknown> | null>(null);

  const [simText, setSimText] = useState('/ping');
  const [simType, setSimType] = useState('message');
  const [lastSimUpdateId, setLastSimUpdateId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bot) {
      setSourceMode('direct');
    }
  }, [bot?.id]);

  const loadUpdates = async () => {
    if (!bot) {
      setUpdates([]);
      setUpdateTotal(0);
      setTotalPages(1);
      return;
    }
    const params = new URLSearchParams();
    if (activeBotId) params.set('botId', String(activeBotId));
    if (updateFilter !== 'all') params.set('type', updateFilter);
    if (search.trim()) params.set('q', search.trim());
    params.set('page', String(page));

    const res = await apiFetch<{ updates: BotUpdate[]; total: number; totalPages: number }>(
      `/api/updates?${params.toString()}`
    );
    setUpdates(res.updates);
    setUpdateTotal(res.total);
    setTotalPages(res.totalPages);
  };

  const loadWebhook = async () => {
    if (!bot) return;
    const res = await apiFetch<{
      bot: BotSummary;
      webhookInfo: Record<string, unknown> | null;
      suggestedUrl: string;
    }>(`/api/bots/${bot.id}/webhook`);
    setWebhookInfo(res.webhookInfo);
    setWebhookUrl(res.bot.webhook_url || res.suggestedUrl);
  };

  useEffect(() => {
    loadUpdates();
  }, [bot?.id, activeBotId, updateFilter, search, page]);

  useEffect(() => {
    loadWebhook();
  }, [bot?.id]);

  useEffect(() => {
    if (!autoPoll || !bot) return;
    const t = setInterval(loadUpdates, 5000);
    return () => clearInterval(t);
  }, [autoPoll, bot?.id, activeBotId, updateFilter, search, page]);

  const handleSetWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bot) return;
    setBusy(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/webhook`, {
        method: 'POST',
        body: JSON.stringify({ url: webhookUrl, secretToken }),
      });
      onToast('success', 'Webhook Configured', 'HTTPS webhook & secret token saved.');
      loadWebhook();
      onRefreshDashboard();
    } catch (err) {
      onToast('error', 'setWebhook Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!bot) return;
    setBusy(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/webhook`, { method: 'DELETE' });
      onToast('info', 'Webhook Deleted', 'Bot switched off webhook mode.');
      loadWebhook();
      onRefreshDashboard();
    } catch (err) {
      onToast('error', 'deleteWebhook Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDirectSetWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; matchedBotId: number | null }>('/api/webhook/direct/set', {
        method: 'POST',
        body: JSON.stringify({
          token: directToken,
          url: directUrl,
          secretToken: directSecret,
          dropPendingUpdates: directDropPending,
        }),
      });
      onToast('success', 'Webhook Set Successfully', res.message || 'Hosted webhook URL configured on Telegram.');
      const infoRes = await apiFetch<{ ok: boolean; webhookInfo: Record<string, unknown> | null }>('/api/webhook/direct/info', {
        method: 'POST',
        body: JSON.stringify({ token: directToken }),
      });
      setDirectWebhookInfo(infoRes.webhookInfo);
      if (res.matchedBotId) onRefreshDashboard();
    } catch (err) {
      onToast('error', 'Set Webhook Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDirectGetInfo = async () => {
    setBusy(true);
    try {
      const infoRes = await apiFetch<{ ok: boolean; webhookInfo: Record<string, unknown> | null }>('/api/webhook/direct/info', {
        method: 'POST',
        body: JSON.stringify({ token: directToken }),
      });
      setDirectWebhookInfo(infoRes.webhookInfo);
      const currentUrl = typeof infoRes.webhookInfo?.url === 'string' ? infoRes.webhookInfo.url : '';
      if (currentUrl && !directUrl) setDirectUrl(currentUrl);
      onToast('info', 'Webhook Info Loaded', currentUrl ? `Active URL: ${currentUrl}` : 'No webhook is currently set.');
    } catch (err) {
      onToast('error', 'Lookup Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDirectDeleteWebhook = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; matchedBotId: number | null }>('/api/webhook/direct/delete', {
        method: 'POST',
        body: JSON.stringify({
          token: directToken,
          dropPendingUpdates: directDropPending,
        }),
      });
      onToast('info', 'Webhook Deleted', res.message || 'Webhook removed from bot.');
      const infoRes = await apiFetch<{ ok: boolean; webhookInfo: Record<string, unknown> | null }>('/api/webhook/direct/info', {
        method: 'POST',
        body: JSON.stringify({ token: directToken }),
      });
      setDirectWebhookInfo(infoRes.webhookInfo);
      if (res.matchedBotId) onRefreshDashboard();
    } catch (err) {
      onToast('error', 'Delete Webhook Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleSimulateWebhook = async (opts?: { updateId?: number; useBadSecret?: boolean }) => {
    if (!bot) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; status: string; message: string; updateId: number }>(
        `/api/bots/${bot.id}/webhook/simulate`,
        {
          method: 'POST',
          body: JSON.stringify({
            updateType: simType,
            text: simText,
            updateId: opts?.updateId,
            useBadSecret: opts?.useBadSecret,
          }),
        }
      );
      setLastSimUpdateId(res.updateId);
      onToast(
        res.status === 'duplicate' ? 'info' : 'success',
        res.status === 'duplicate' ? 'Duplicate Prevented' : 'Webhook Update Processed',
        res.message
      );
      loadUpdates();
      onRefreshDashboard();
    } catch (err) {
      onToast('error', 'Webhook Rejected', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation & Bot Picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('updates')}
            className={`px-3.5 py-2 min-h-[38px] text-xs font-medium rounded-lg transition-colors ${
              tab === 'updates'
                ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white'
                : 'text-[#73798C] dark:text-slate-400'
            }`}
          >
            Update Monitor ({updateTotal})
          </button>
          <button
            type="button"
            onClick={() => setTab('webhook')}
            className={`px-3.5 py-2 min-h-[38px] text-xs font-medium rounded-lg transition-colors ${
              tab === 'webhook'
                ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white'
                : 'text-[#73798C] dark:text-slate-400'
            }`}
          >
            Webhook Manager
          </button>
        </div>

        {bot && (
          <div className="flex items-center gap-2">
            <select
              aria-label="Bot selector"
              value={bot.id}
              onChange={(e) => onSelectBot(Number(e.target.value))}
              className="px-3 py-2 min-h-[40px] text-xs font-medium rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id} data-no-smallcaps="true">
                  @{b.username}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAutoPoll(!autoPoll)}
              className={`px-3 py-2 min-h-[40px] rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 ${
                autoPoll
                  ? 'border-[#20C997] text-[#118A66] dark:text-[#20C997] bg-[#20C997]/10'
                  : 'border-[#E8EAF1] dark:border-slate-800 bg-white dark:bg-[#151B2B]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoPoll ? 'animate-spin' : ''}`} />
              <span>{autoPoll ? 'Polling 5s' : 'Auto Poll'}</span>
            </button>
          </div>
        )}
      </div>

      {tab === 'webhook' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Webhook Manager</h3>
                {sourceMode === 'connected' && bot && (
                  <StatusBadge
                    status={bot.webhook_status === 'active' ? 'success' : 'neutral'}
                    label={`Webhook: ${bot.webhook_status}`}
                  />
                )}
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                {bot && (
                  <button
                    type="button"
                    onClick={() => setSourceMode('connected')}
                    className={`px-3 py-1.5 min-h-[32px] text-xs font-medium rounded-lg transition-colors ${
                      sourceMode === 'connected'
                        ? 'bg-white dark:bg-[#151B2B] text-[#171A2B] dark:text-white shadow-xs'
                        : 'text-[#73798C] dark:text-slate-400'
                    }`}
                  >
                    Connected Bot
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSourceMode('direct')}
                  className={`px-3 py-1.5 min-h-[32px] text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1 ${
                    sourceMode === 'direct'
                      ? 'bg-white dark:bg-[#151B2B] text-[#171A2B] dark:text-white shadow-xs'
                      : 'text-[#73798C] dark:text-slate-400'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Host URL & Token</span>
                </button>
              </div>
            </div>

            {sourceMode === 'connected' && bot ? (
              <form onSubmit={handleSetWebhook} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1">HTTPS Webhook Endpoint URL</label>
                  <input
                    type="url"
                    required
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-domain.com/api/webhook/..."
                    className="w-full px-3.5 py-2.5 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    X-Telegram-Bot-Api-Secret-Token (optional custom or auto-generated)
                  </label>
                  <input
                    type="text"
                    value={secretToken}
                    onChange={(e) => setSecretToken(e.target.value)}
                    placeholder="Leave blank to preserve or auto-generate secure token"
                    className="w-full px-3.5 py-2.5 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Set Webhook
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={loadWebhook}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium disabled:opacity-50"
                  >
                    Get Webhook Info
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDeleteWebhook}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Webhook</span>
                  </button>
                </div>

                {webhookInfo && (
                  <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                    <div className="text-[11px] font-medium text-[#73798C] mb-1">getWebhookInfo Response</div>
                    <pre className="text-[11px] font-mono overflow-x-auto">{JSON.stringify(webhookInfo, null, 2)}</pre>
                  </div>
                )}
              </form>
            ) : (
              <form onSubmit={handleDirectSetWebhook} className="space-y-4">
                <div>
                  <label htmlFor="direct-webhook-url" className="block text-xs font-medium mb-1">
                    Hosted Bot Webhook URL (HTTPS)
                  </label>
                  <input
                    id="direct-webhook-url"
                    type="url"
                    required
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    placeholder="https://your-bot-host.vercel.app/api/webhook"
                    className="w-full px-3.5 py-2.5 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                  />
                </div>

                <div>
                  <label htmlFor="direct-bot-token" className="block text-xs font-medium mb-1">
                    Telegram Bot Token
                  </label>
                  <div className="relative">
                    <input
                      id="direct-bot-token"
                      type={showDirectToken ? 'text' : 'password'}
                      required
                      value={directToken}
                      onChange={(e) => setDirectToken(e.target.value)}
                      placeholder="123456789:AAH... or sandbox:bot_name"
                      className="w-full pl-3.5 pr-11 py-2.5 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDirectToken((v) => !v)}
                      aria-label={showDirectToken ? 'Hide bot token' : 'Show bot token'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#73798C] hover:text-[#171A2B] dark:text-slate-400 dark:hover:text-white"
                    >
                      {showDirectToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-1">
                    Paste the bot token to directly set, inspect, or delete its webhook on Telegram. Tokens are never exposed in logs.
                  </p>
                </div>

                <div>
                  <label htmlFor="direct-secret-token" className="block text-xs font-medium mb-1">
                    Secret Token (Optional)
                  </label>
                  <input
                    id="direct-secret-token"
                    type="text"
                    value={directSecret}
                    onChange={(e) => setDirectSecret(e.target.value)}
                    placeholder="Optional X-Telegram-Bot-Api-Secret-Token header value"
                    className="w-full px-3.5 py-2.5 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[#73798C] dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={directDropPending}
                    onChange={(e) => setDirectDropPending(e.target.checked)}
                  />
                  <span>Drop pending queued updates when setting or deleting webhook</span>
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={busy || !directToken.trim() || !directUrl.trim()}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Set Webhook
                  </button>
                  <button
                    type="button"
                    disabled={busy || !directToken.trim()}
                    onClick={handleDirectGetInfo}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium disabled:opacity-50"
                  >
                    Get Webhook Info
                  </button>
                  <button
                    type="button"
                    disabled={busy || !directToken.trim()}
                    onClick={handleDirectDeleteWebhook}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] hover:bg-[#F05B75]/10 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Webhook</span>
                  </button>
                </div>

                {directWebhookInfo && (
                  <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                    <div className="text-[11px] font-medium text-[#73798C] mb-1">Direct getWebhookInfo Response</div>
                    <pre className="text-[11px] font-mono overflow-x-auto">{JSON.stringify(directWebhookInfo, null, 2)}</pre>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Right Panel: Receiver Tester when bot is connected, or Hosted Webhook Guide */}
          <div className="lg:col-span-5 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
            {bot ? (
              <>
                <div>
                  <h3 className="text-sm font-semibold">Incoming Webhook Receiver Tester</h3>
                  <p className="text-xs text-[#73798C] dark:text-slate-400 mt-0.5">
                    Tests secret header verification and update_id duplicate prevention against the live receiver.
                  </p>
                </div>

                <div className="space-y-3">
                  <select
                    aria-label="Update type"
                    value={simType}
                    onChange={(e) => setSimType(e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                  >
                    <option value="message">message</option>
                    <option value="edited_message">edited_message</option>
                    <option value="callback_query">callback_query</option>
                    <option value="channel_post">channel_post</option>
                  </select>

                  <input
                    type="text"
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    placeholder="Update text or callback_data..."
                    aria-label="Simulated payload text"
                    className="w-full px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                  />

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSimulateWebhook()}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-[#20C997] text-[#090B14] text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Send Signed Test Update</span>
                  </button>

                  {lastSimUpdateId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSimulateWebhook({ updateId: lastSimUpdateId })}
                      className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium"
                    >
                      Replay Update #{lastSimUpdateId} (Test Duplicate Guard)
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSimulateWebhook({ useBadSecret: true })}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[#F05B75]/30 text-[#F05B75] text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Test Invalid Secret Rejection (401)</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-[#6555E8] dark:text-[#988DF9]" />
                  <h3 className="text-sm font-semibold">Quick Direct Webhook Setup</h3>
                </div>
                <p className="text-xs text-[#73798C] dark:text-slate-400 leading-relaxed">
                  Point any hosted bot endpoint directly to Telegram without needing to add the bot to your fleet first:
                </p>
                <ol className="text-xs text-[#73798C] dark:text-slate-300 space-y-2 list-decimal list-inside">
                  <li>Enter the HTTPS webhook URL of where your bot is hosted.</li>
                  <li>Paste your @BotFather bot token (kept masked and never written to plaintext logs).</li>
                  <li>Click <strong>Set Webhook</strong> to bind updates, or <strong>Delete Webhook</strong> anytime to clear it.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'updates' && !bot && (
        <EmptyState
          icon={Webhook}
          title="No Connected Bot for Update Monitor"
          description="Connect a bot to stream incoming webhook updates here, or switch to Webhook Manager to configure any bot URL & token directly."
          actionLabel="Open Webhook Manager"
          onAction={() => {
            setSourceMode('direct');
            setTab('webhook');
          }}
        />
      )}

      {tab === 'updates' && bot && (
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#73798C] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by update_id, @username, or text..."
                className="w-full pl-10 pr-4 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
            <select
              aria-label="Filter update category"
              value={updateFilter}
              onChange={(e) => {
                setUpdateFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            >
              <option value="all">All Categories</option>
              <option value="message">Message</option>
              <option value="edited_message">Edited Message</option>
              <option value="channel_post">Channel Post</option>
              <option value="callback_query">Callback Query</option>
              <option value="inline_query">Inline Query</option>
              <option value="my_chat_member">My Chat Member</option>
            </select>
            <button
              type="button"
              onClick={() => handleSimulateWebhook()}
              className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Simulate Update</span>
            </button>
          </div>

          {updates.length === 0 ? (
            <p className="text-xs text-[#73798C] dark:text-slate-400 py-8 text-center">
              No incoming updates match your filter.
            </p>
          ) : (
            <div className="divide-y divide-[#E8EAF1] dark:divide-slate-800">
              {updates.map((u) => (
                <div key={u.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-[#6555E8] dark:text-[#988DF9]">
                        #{u.update_id}
                      </span>
                      <StatusBadge status="accent" label={u.update_type} />
                      <span className="font-mono text-[#73798C] dark:text-slate-400 truncate">@{u.bot_username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={u.processing_status === 'processed' ? 'success' : 'warning'}
                        label={u.processing_status}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                        aria-label={`Inspect update ${u.update_id}`}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {expandedId === u.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#171A2B] dark:text-slate-300 mt-1 truncate">
                    {u.summary} {u.sender_username ? `· from @${u.sender_username}` : ''} · {u.received_at}
                  </p>
                  {expandedId === u.id && (
                    <div className="mt-2 p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-mono text-[#73798C]">Raw Update JSON</span>
                        <CopyButton text={u.raw_json} />
                      </div>
                      <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(JSON.parse(u.raw_json), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-[#E8EAF1] dark:border-slate-800 text-xs">
              <span className="font-mono text-[#73798C]">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-[#E8EAF1] dark:border-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-[#E8EAF1] dark:border-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

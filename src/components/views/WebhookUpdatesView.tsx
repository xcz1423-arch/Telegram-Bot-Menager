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

  const [tab, setTab] = useState<'updates' | 'webhook'>('updates');
  const [updates, setUpdates] = useState<BotUpdate[]>([]);
  const [updateTotal, setUpdateTotal] = useState(0);
  const [updateFilter, setUpdateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoPoll, setAutoPoll] = useState(false);

  // Webhook config state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [secretToken, setSecretToken] = useState('');
  const [webhookInfo, setWebhookInfo] = useState<Record<string, unknown> | null>(null);
  const [simText, setSimText] = useState('/ping');
  const [simType, setSimType] = useState('message');
  const [lastSimUpdateId, setLastSimUpdateId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const loadUpdates = async () => {
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
  }, [activeBotId, updateFilter, search, page]);

  useEffect(() => {
    loadWebhook();
  }, [bot?.id]);

  useEffect(() => {
    if (!autoPoll) return;
    const t = setInterval(loadUpdates, 5000);
    return () => clearInterval(t);
  }, [autoPoll, activeBotId, updateFilter, search, page]);

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

  if (!bot) {
    return (
      <EmptyState
        icon={Webhook}
        title="No Connected Bot"
        description="Connect a bot to configure HTTPS webhooks and monitor incoming Telegram updates."
      />
    );
  }

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

        <div className="flex items-center gap-2">
          <select
            aria-label="Bot selector"
            value={bot.id}
            onChange={(e) => onSelectBot(Number(e.target.value))}
            className="px-3 py-2 min-h-[40px] text-xs font-medium rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800"
          >
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
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
      </div>

      {tab === 'webhook' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSetWebhook}
            className="lg:col-span-7 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Configure HTTPS Webhook</h3>
              <StatusBadge
                status={bot.webhook_status === 'active' ? 'success' : 'neutral'}
                label={`Webhook: ${bot.webhook_status}`}
              />
            </div>

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
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-semibold"
              >
                Set Webhook
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={loadWebhook}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium"
              >
                Get Webhook Info
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDeleteWebhook}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] text-xs font-medium inline-flex items-center gap-1.5"
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

          {/* Incoming Webhook Verification & Idempotency Tester */}
          <div className="lg:col-span-5 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
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
          </div>
        </div>
      )}

      {tab === 'updates' && (
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

import React, { useEffect, useState } from 'react';
import {
  Bot,
  Send,
  Webhook,
  Code2,
  FileText,
  Plus,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { AdminUser, BotSummary, NavTab } from '../../types';
import { ActivityTimelineChart, SuccessRateDonut, TimeSeriesPoint } from '../charts/SvgCharts';
import { SkeletonRows, StatusBadge } from '../ui/Primitives';

interface DashboardPayload {
  stats: {
    totalBots: number;
    activeBots: number;
    inactiveBots: number;
    totalMessagesSent: number;
    totalUpdatesReceived: number;
    totalApiRequests: number;
    successfulApiRequests: number;
    failedApiRequests: number;
  };
  bots: BotSummary[];
  series: TimeSeriesPoint[];
  recentUpdates: Array<{
    id: number;
    bot_id: number;
    bot_name: string;
    bot_username: string;
    update_id: number;
    update_type: string;
    summary: string;
    processing_status: string;
    received_at: string;
  }>;
  recentMessages: Array<{
    id: number;
    bot_id: number;
    bot_name: string;
    chat_id: string;
    message_type: string;
    content_preview: string;
    delivery_status: string;
    sent_at: string;
  }>;
  recentApiRequests: Array<{
    id: number;
    bot_id: number;
    bot_username: string | null;
    method: string;
    http_status: number;
    ok: number;
    duration_ms: number;
    error_message: string | null;
    created_at: string;
  }>;
}

export function DashboardView({
  admin,
  activeBotId,
  onSelectBot,
  onNavigate,
  onOpenAddBot,
  refreshKey,
}: {
  admin: AdminUser;
  activeBotId: number | null;
  onSelectBot: (id: number | null) => void;
  onNavigate: (tab: NavTab) => void;
  onOpenAddBot: () => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowLabel, setNowLabel] = useState(() => new Date().toLocaleString());

  const load = async () => {
    setLoading(true);
    try {
      const url = activeBotId ? `/api/dashboard?botId=${activeBotId}` : '/api/dashboard';
      const res = await apiFetch<DashboardPayload>(url);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeBotId, refreshKey]);

  useEffect(() => {
    const t = setInterval(() => setNowLabel(new Date().toLocaleString()), 30000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data) {
    return <SkeletonRows rows={6} />;
  }

  const stats = data?.stats || {
    totalBots: 0,
    activeBots: 0,
    inactiveBots: 0,
    totalMessagesSent: 0,
    totalUpdatesReceived: 0,
    totalApiRequests: 0,
    successfulApiRequests: 0,
    failedApiRequests: 0,
  };

  const kpiCards = [
    { label: 'Total Connected Bots', value: stats.totalBots, tone: 'text-[#171A2B] dark:text-white' },
    { label: 'Active Bots', value: stats.activeBots, tone: 'text-[#118A66] dark:text-[#20C997]' },
    { label: 'Inactive Bots', value: stats.inactiveBots, tone: 'text-[#9A6807] dark:text-[#F5B942]' },
    { label: 'Messages Sent', value: stats.totalMessagesSent, tone: 'text-[#6555E8] dark:text-[#988DF9]' },
    { label: 'Updates Received', value: stats.totalUpdatesReceived, tone: 'text-[#0D8EB8] dark:text-[#22C8F6]' },
    { label: 'Total API Requests', value: stats.totalApiRequests, tone: 'text-[#171A2B] dark:text-white' },
    { label: 'Successful Requests', value: stats.successfulApiRequests, tone: 'text-[#118A66] dark:text-[#20C997]' },
    { label: 'Failed Requests', value: stats.failedApiRequests, tone: 'text-[#C72544] dark:text-[#F05B75]' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions Strip */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-display font-bold tracking-tight">
            Welcome back, {admin.displayName}
          </h2>
          <p className="text-xs text-[#73798C] dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
            {nowLabel} · One Dashboard. Complete Bot Control.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenAddBot}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5646d5] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Bot</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('messages')}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Message</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('explorer')}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>API Explorer</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('webhooks')}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Webhooks</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('activity')}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Logs</span>
          </button>
          <button
            type="button"
            onClick={load}
            aria-label="Refresh dashboard statistics"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#73798C] dark:text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>

      {/* 8 Real-DB Statistics Cards */}
      <section aria-label="Key performance indicators" className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {kpiCards.map((k) => (
          <div
            key={k.label}
            className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4"
          >
            <div className="text-xs text-[#73798C] dark:text-slate-400 truncate">{k.label}</div>
            <div className={`text-2xl font-display font-bold font-mono tabular-nums mt-1.5 ${k.tone}`}>
              {k.value.toLocaleString()}
            </div>
          </div>
        ))}
      </section>

      {/* Analytics Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold">Traffic & Execution Timeline</h3>
              <p className="text-xs text-[#73798C] dark:text-slate-400">Daily API calls, webhook updates, and outgoing messages</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-[#6555E8] dark:text-[#988DF9] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Full Analytics</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <ActivityTimelineChart data={data?.series || []} />
        </div>

        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold">API Reliability</h3>
            <p className="text-xs text-[#73798C] dark:text-slate-400 mb-4">Success vs. failure ratio across all executions</p>
          </div>
          <SuccessRateDonut
            success={stats.successfulApiRequests}
            failed={stats.failedApiRequests}
          />
          <div className="mt-4 pt-3 border-t border-[#E8EAF1] dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-[#73798C] dark:text-slate-400">Need deep inspection?</span>
            <button
              type="button"
              onClick={() => onNavigate('debug')}
              className="font-medium text-[#6555E8] dark:text-[#988DF9] hover:underline"
            >
              Open Debug Console
            </button>
          </div>
        </div>
      </section>

      {/* Connected Bots Overview */}
      <section className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold">Connected Bots Overview</h3>
            <p className="text-xs text-[#73798C] dark:text-slate-400">Tap any bot to filter the console or manage its configuration</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('bots')}
            className="text-xs font-medium text-[#6555E8] dark:text-[#988DF9] hover:underline whitespace-nowrap"
          >
            Manage Fleet
          </button>
        </div>

        {!data?.bots.length ? (
          <div className="py-8 text-center text-xs text-[#73798C] dark:text-slate-400">
            No Telegram bots connected yet. Click Add New Bot to connect one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.bots.map((bot) => (
              <div
                key={bot.id}
                className={`p-4 rounded-xl border transition-colors ${
                  activeBotId === bot.id
                    ? 'border-[#7565F6] bg-[#6555E8]/5 dark:bg-[#7565F6]/8'
                    : 'border-[#E8EAF1] dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#6555E8]/12 dark:bg-[#7565F6]/20 text-[#6555E8] dark:text-[#A599FF] flex items-center justify-center font-display font-bold text-sm shrink-0">
                      {bot.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{bot.name}</div>
                      <div className="text-xs font-mono text-[#73798C] dark:text-slate-400 truncate">
                        @{bot.username} · {bot.telegram_bot_id}
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    status={bot.connection_status === 'connected' ? 'success' : bot.connection_status === 'disconnected' ? 'neutral' : 'danger'}
                    label={bot.connection_status === 'connected' ? 'Connected' : bot.connection_status === 'disconnected' ? 'Paused' : 'Error'}
                  />
                </div>

                <div className="mt-3 pt-3 border-t border-[#E8EAF1] dark:border-slate-800 flex items-center justify-between text-xs gap-2">
                  <div className="text-[#73798C] dark:text-slate-400 truncate">
                    Webhook: <span className="font-medium text-[#171A2B] dark:text-slate-200">{bot.webhook_status}</span> · {bot.mode}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectBot(bot.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium"
                    >
                      {activeBotId === bot.id ? 'Selected' : 'Focus'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBot(bot.id);
                        onNavigate('bots');
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[#6555E8] dark:text-[#988DF9] hover:bg-[#7565F6]/10 text-xs font-medium"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity Overview (3 Columns on Desktop) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Incoming Updates */}
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Recent Incoming Updates</h3>
            <button
              type="button"
              onClick={() => onNavigate('webhooks')}
              className="text-xs text-[#6555E8] dark:text-[#988DF9] hover:underline"
            >
              Monitor
            </button>
          </div>
          <div className="divide-y divide-[#E8EAF1] dark:divide-slate-800">
            {(data?.recentUpdates || []).length === 0 ? (
              <p className="text-xs text-[#73798C] py-4">No incoming updates yet.</p>
            ) : (
              data!.recentUpdates.map((u) => (
                <div key={u.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-mono font-medium text-[#6555E8] dark:text-[#988DF9]">
                      #{u.update_id} · {u.update_type}
                    </span>
                    <span className="text-[11px] text-[#73798C] dark:text-slate-400 truncate">@{u.bot_username}</span>
                  </div>
                  <p className="text-xs text-[#171A2B] dark:text-slate-300 mt-0.5 truncate">{u.summary}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Outgoing Messages */}
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Recent Outgoing Messages</h3>
            <button
              type="button"
              onClick={() => onNavigate('messages')}
              className="text-xs text-[#6555E8] dark:text-[#988DF9] hover:underline"
            >
              Compose
            </button>
          </div>
          <div className="divide-y divide-[#E8EAF1] dark:divide-slate-800">
            {(data?.recentMessages || []).length === 0 ? (
              <p className="text-xs text-[#73798C] py-4">No outgoing messages recorded.</p>
            ) : (
              data!.recentMessages.map((m) => (
                <div key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-mono text-[#73798C] dark:text-slate-400">Chat {m.chat_id}</span>
                    <StatusBadge
                      status={m.delivery_status === 'sent' ? 'success' : 'danger'}
                      label={m.delivery_status === 'sent' ? 'Sent' : 'Failed'}
                    />
                  </div>
                  <p className="text-xs text-[#171A2B] dark:text-slate-300 mt-1 truncate">{m.content_preview}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Latest API Requests */}
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Latest API Requests</h3>
            <button
              type="button"
              onClick={() => onNavigate('debug')}
              className="text-xs text-[#6555E8] dark:text-[#988DF9] hover:underline"
            >
              Console
            </button>
          </div>
          <div className="divide-y divide-[#E8EAF1] dark:divide-slate-800">
            {(data?.recentApiRequests || []).length === 0 ? (
              <p className="text-xs text-[#73798C] py-4">No API calls logged yet.</p>
            ) : (
              data!.recentApiRequests.map((a) => (
                <div key={a.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono font-medium truncate">{a.method}</div>
                    <div className="text-[11px] text-[#73798C] dark:text-slate-400 truncate">
                      {a.bot_username ? `@${a.bot_username}` : 'System'} · {a.duration_ms}ms
                    </div>
                  </div>
                  <StatusBadge
                    status={a.ok ? 'success' : 'danger'}
                    label={`${a.http_status} ${a.ok ? 'OK' : 'ERR'}`}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

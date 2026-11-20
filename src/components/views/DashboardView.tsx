import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Box,
  CheckCircle2,
  AlertTriangle,
  Send,
  Webhook,
  Code2,
  FileText,
  Plus,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatBangladeshDateTime } from '../../lib/timeFormat';
import type { AdminUser, BotSummary, NavTab } from '../../types';
import { ActivityTimelineChart, SuccessRateDonut, TimeSeriesPoint } from '../charts/SvgCharts';
import { SkeletonRows, StatusBadge } from '../ui/Primitives';
import { UserAvatar, VerifiedBadgeIcon } from '../ui/VerifiedBadge';

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
  const [nowLabel, setNowLabel] = useState(() => formatBangladeshDateTime(new Date()));

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
    const t = setInterval(() => setNowLabel(formatBangladeshDateTime(new Date())), 1000);
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
    {
      label: 'Total Connected Bots',
      value: stats.totalBots,
      tone: 'text-[#171A2B] dark:text-white',
      icon: (
        <Bot
          className="w-8 h-8 sm:w-9 sm:h-9 text-[#7C3AED] dark:text-[#8B5CF6] drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]"
          strokeWidth={2}
        />
      ),
    },
    {
      label: 'Active Bots',
      value: stats.activeBots,
      tone: 'text-[#118A66] dark:text-[#20C997]',
      icon: (
        <Activity
          className="w-8 h-8 sm:w-9 sm:h-9 text-[#118A66] dark:text-[#22C55E] drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]"
          strokeWidth={2.25}
        />
      ),
    },
    {
      label: 'Inactive Bots',
      value: stats.inactiveBots,
      tone: 'text-[#D97706] dark:text-[#FBBF24]',
      icon: (
        <svg
          viewBox="0 0 36 36"
          fill="none"
          className="w-8 h-8 sm:w-9 sm:h-9 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
          aria-hidden="true"
        >
          <circle cx="18" cy="18" r="14" fill="#FBBF24" />
          <rect x="13.5" y="12" width="3" height="12" rx="1.5" fill="#151B2B" />
          <rect x="19.5" y="12" width="3" height="12" rx="1.5" fill="#151B2B" />
        </svg>
      ),
    },
    {
      label: 'Messages Sent',
      value: stats.totalMessagesSent,
      tone: 'text-[#6555E8] dark:text-[#988DF9]',
      icon: (
        <svg
          viewBox="0 0 36 36"
          fill="none"
          className="w-8 h-8 sm:w-9 sm:h-9 text-[#7C3AED] dark:text-[#8B5CF6] drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]"
          aria-hidden="true"
        >
          <path
            d="M9.5 7h17A3.5 3.5 0 0 1 30 10.5v10.5a3.5 3.5 0 0 1-3.5 3.5H15.5l-5.3 4.1a.9.9 0 0 1-1.45-.71V24.4A3.5 3.5 0 0 1 6 21V10.5A3.5 3.5 0 0 1 9.5 7Z"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <circle cx="13.5" cy="15.75" r="1.45" fill="currentColor" />
          <circle cx="18" cy="15.75" r="1.45" fill="currentColor" />
          <circle cx="22.5" cy="15.75" r="1.45" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: 'Updates Received',
      value: stats.totalUpdatesReceived,
      tone: 'text-[#0D8EB8] dark:text-[#22C8F6]',
      icon: (
        <svg
          viewBox="0 0 36 36"
          fill="none"
          className="w-8 h-8 sm:w-9 sm:h-9 text-[#0284C7] dark:text-[#0EA5E9] drop-shadow-[0_0_8px_rgba(14,165,233,0.5)]"
          aria-hidden="true"
        >
          <path
            d="M11 26h14.5a5.5 5.5 0 0 0 1.1-10.89A7.5 7.5 0 0 0 12.2 12.9 6 6 0 0 0 11 26Z"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19 15.5l-3 4h4l-2 4.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      label: 'Total API Requests',
      value: stats.totalApiRequests,
      tone: 'text-[#171A2B] dark:text-white',
      icon: (
        <Box
          className="w-8 h-8 sm:w-9 sm:h-9 text-[#171A2B] dark:text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.28)]"
          strokeWidth={2}
        />
      ),
    },
    {
      label: 'Successful Requests',
      value: stats.successfulApiRequests,
      tone: 'text-[#118A66] dark:text-[#20C997]',
      icon: (
        <CheckCircle2
          className="w-8 h-8 sm:w-9 sm:h-9 text-[#118A66] dark:text-[#20C997] drop-shadow-[0_0_8px_rgba(32,201,151,0.5)]"
          strokeWidth={2.1}
        />
      ),
    },
    {
      label: 'Failed Requests',
      value: stats.failedApiRequests,
      tone: 'text-[#C72544] dark:text-[#F05B75]',
      icon: (
        <AlertTriangle
          className="w-8 h-8 sm:w-9 sm:h-9 text-[#C72544] dark:text-[#F05B75] drop-shadow-[0_0_8px_rgba(240,91,117,0.5)]"
          strokeWidth={2.1}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions Strip */}
      <section className="flex flex-col items-center text-center gap-4 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col items-center gap-3 min-w-0 w-full">
          <img
            src="/assets/aistudio/file_000000007dd8820b9043e2e9eb3cd7c6_34c37a13.png"
            alt="XC BOT CONTROL"
            className="w-56 h-36 sm:w-72 sm:h-48 object-contain mx-auto shrink-0 border-0"
          />
          <div className="flex flex-col items-center gap-2 min-w-0 max-w-full">
            <UserAvatar
              avatarUrl={admin.avatarUrl}
              displayName={admin.displayName}
              username={admin.username}
              badge={admin.badge}
              role={admin.role}
              size="lg"
            />
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-display font-bold tracking-tight">
                Welcome back, <span data-no-smallcaps="true">{admin.displayName}</span>
              </h2>
              <VerifiedBadgeIcon badge={admin.badge} role={admin.role} size="md" />
            </div>
            <div className="text-xs font-mono tabular-nums text-[#6555E8] dark:text-[#A599FF] font-semibold">
              {nowLabel}
            </div>
            <p className="text-xs text-[#73798C] dark:text-slate-400">
              One Dashboard. Complete Bot Control.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
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
            className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3 sm:gap-4"
          >
            <div className="shrink-0 flex items-center justify-center" aria-hidden="true">
              {k.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] sm:text-xs text-[#73798C] dark:text-slate-400 truncate">
                {k.label}
              </div>
              <div className={`text-2xl font-display font-bold font-mono tabular-nums mt-0.5 leading-tight ${k.tone}`}>
                {k.value.toLocaleString()}
              </div>
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
                    {bot.avatar_url ? (
                      <img
                        src={bot.avatar_url}
                        alt={bot.name}
                        className="w-10 h-10 rounded-xl object-cover border border-[#E8EAF1] dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <div data-no-smallcaps="true" className="w-10 h-10 rounded-xl bg-[#6555E8]/12 dark:bg-[#7565F6]/20 text-[#6555E8] dark:text-[#A599FF] flex items-center justify-center font-display font-bold text-sm shrink-0">
                        {bot.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div data-no-smallcaps="true" className="text-sm font-semibold truncate">{bot.name}</div>
                      <div className="text-xs font-mono text-[#73798C] dark:text-slate-400 truncate">
                        <span data-no-smallcaps="true">@{bot.username}</span> · {bot.telegram_bot_id}
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
                    <span data-no-smallcaps="true" className="text-[11px] text-[#73798C] dark:text-slate-400 truncate">@{u.bot_username}</span>
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
                      {a.bot_username ? <span data-no-smallcaps="true">@{a.bot_username}</span> : 'System'} · {a.duration_ms}ms
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

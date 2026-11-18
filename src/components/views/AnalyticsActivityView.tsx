import React, { useEffect, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { BotSummary } from '../../types';
import { ActivityTimelineChart, HorizontalBarBreakdown, SuccessRateDonut, TimeSeriesPoint } from '../charts/SvgCharts';
import { StatusBadge } from '../ui/Primitives';

interface AnalyticsPayload {
  summary: {
    total_api: number;
    success_api: number;
    failed_api: number;
    messages_sent: number;
    updates_received: number;
    unique_chats: number;
    avg_response_ms: number;
    success_rate: number;
  };
  timeline: TimeSeriesPoint[];
  byBot: Array<{ id: number; name: string; username: string; api_requests: number; messages_sent: number }>;
  updateDist: Array<{ update_type: string; count: number }>;
}

export function AnalyticsView({
  bots,
  activeBotId,
  onSelectBot,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (id: number | null) => void;
}) {
  const [range, setRange] = useState<'today' | 'yesterday' | '7d' | '14d' | '30d'>('14d');
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ range });
    if (activeBotId) params.set('botId', String(activeBotId));
    apiFetch<AnalyticsPayload>(`/api/analytics?${params.toString()}`).then(setData);
  }, [range, activeBotId]);

  const s = data?.summary;

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F6F7FB] dark:bg-[#101421]">
          {[
            { id: 'today' as const, label: 'Today' },
            { id: 'yesterday' as const, label: 'Yesterday' },
            { id: '7d' as const, label: '7 Days' },
            { id: '14d' as const, label: '14 Days' },
            { id: '30d' as const, label: '30 Days' },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-lg whitespace-nowrap ${
                range === r.id ? 'bg-white dark:bg-[#151B2B] shadow-xs' : 'text-[#73798C]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter analytics by bot"
            value={activeBotId ?? ''}
            onChange={(e) => onSelectBot(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-2 min-h-[38px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
          >
            <option value="">All Bots</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                @{b.username}
              </option>
            ))}
          </select>
          <a
            href="/api/analytics/export?format=csv"
            download
            className="px-3 py-2 min-h-[38px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </a>
          <a
            href="/api/analytics/export?format=json"
            download
            className="px-3 py-2 min-h-[38px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 min-h-[38px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'API Requests', val: s.total_api },
            { label: 'Success Rate', val: `${s.success_rate}%` },
            { label: 'Messages Sent', val: s.messages_sent },
            { label: 'Updates Received', val: s.updates_received },
            { label: 'Known Chats', val: s.unique_chats },
            { label: 'Avg Latency', val: `${s.avg_response_ms}ms` },
          ].map((k) => (
            <div key={k.label} className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-[#73798C] dark:text-slate-400">{k.label}</div>
              <div className="text-xl font-display font-bold font-mono tabular-nums mt-1">
                {typeof k.val === 'number' ? k.val.toLocaleString() : k.val}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">Daily Usage & Message Activity</h3>
          <ActivityTimelineChart data={data?.timeline || []} />
        </div>
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">Request Outcomes</h3>
          <SuccessRateDonut success={s?.success_api || 0} failed={s?.failed_api || 0} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">Activity by Connected Bot</h3>
          <HorizontalBarBreakdown
            items={(data?.byBot || []).map((b) => ({
              label: b.name,
              sublabel: `@${b.username}`,
              value: b.api_requests,
              color: '#7565F6',
            }))}
          />
        </div>
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">Update Type Distribution</h3>
          <HorizontalBarBreakdown
            items={(data?.updateDist || []).map((u) => ({
              label: u.update_type,
              value: u.count,
              color: '#22C8F6',
            }))}
          />
        </div>
      </div>
    </div>
  );
}

interface ActivityLogRow {
  id: number;
  action: string;
  bot_name: string | null;
  status: 'success' | 'warning' | 'failed';
  related_resource: string | null;
  details: string | null;
  created_at: string;
}

export function ActivityLogsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), status: statusFilter });
    if (search.trim()) params.set('q', search.trim());
    apiFetch<{ logs: ActivityLogRow[]; totalPages: number }>(`/api/activity-logs?${params.toString()}`).then((res) => {
      setRows(res.logs);
      setTotalPages(res.totalPages);
    });
  }, [search, statusFilter, page]);

  return (
    <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#73798C] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search audit events, bots, or details..."
            className="w-full pl-10 pr-4 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Filter status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="failed">Failed</option>
          </select>
          <a
            href="/api/activity-logs/export"
            download
            className="px-3.5 py-2 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      <div className="divide-y divide-[#E8EAF1] dark:divide-slate-800">
        {rows.map((r) => (
          <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold text-[#171A2B] dark:text-slate-100">{r.action}</span>
                {r.bot_name && <span className="text-[#6555E8] dark:text-[#988DF9] font-medium">{r.bot_name}</span>}
                {r.related_resource && <span className="font-mono text-[#73798C]">{r.related_resource}</span>}
              </div>
              {r.details && <p className="text-[#73798C] dark:text-slate-400 mt-0.5 truncate">{r.details}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-[11px] text-[#73798C] tabular-nums">{r.created_at}</span>
              <StatusBadge
                status={r.status === 'success' ? 'success' : r.status === 'warning' ? 'warning' : 'danger'}
                label={r.status}
              />
            </div>
          </div>
        ))}
      </div>

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
  );
}

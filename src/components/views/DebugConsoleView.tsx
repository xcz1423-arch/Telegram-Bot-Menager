import React, { useEffect, useState } from 'react';
import { Bug, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { BotSummary } from '../../types';
import { CopyButton, StatusBadge } from '../ui/Primitives';

interface DebugLogEntry {
  source: 'api' | 'webhook';
  id: number;
  bot_id: number | null;
  bot_name: string | null;
  bot_username: string | null;
  title: string;
  http_status: number;
  telegram_error_code: number | null;
  ok: number;
  duration_ms: number;
  request_payload_json: string | null;
  response_payload_json: string;
  error_message: string | null;
  created_at: string;
}

export function DebugConsoleView({
  bots,
  activeBotId,
  onSelectBot,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (id: number | null) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'success' | 'failed' | 'api_error' | 'webhook_error' | 'warning'>('all');
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (activeBotId) params.set('botId', String(activeBotId));
      const res = await apiFetch<{ logs: DebugLogEntry[] }>(`/api/debug/logs?${params.toString()}`);
      setLogs(res.logs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter, activeBotId]);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F6F7FB] dark:bg-[#101421]">
          {[
            { id: 'all' as const, label: 'All' },
            { id: 'success' as const, label: 'Success' },
            { id: 'failed' as const, label: 'Failed' },
            { id: 'api_error' as const, label: 'API Errors' },
            { id: 'webhook_error' as const, label: 'Webhook Errors' },
            { id: 'warning' as const, label: 'Duplicates' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-lg whitespace-nowrap ${
                filter === f.id ? 'bg-white dark:bg-[#151B2B] shadow-xs text-[#171A2B] dark:text-white' : 'text-[#73798C]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Filter by bot"
            value={activeBotId ?? ''}
            onChange={(e) => onSelectBot(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-2 min-h-[40px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
          >
            <option value="">All Bots</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                @{b.username}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            aria-label="Refresh debug logs"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#E8EAF1] dark:border-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        {logs.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#73798C] dark:text-slate-400">
            <Bug className="w-6 h-6 mx-auto mb-2 opacity-50" />
            No debug traces match this filter.
          </div>
        ) : (
          <div className="divide-y divide-[#E8EAF1] dark:divide-slate-800">
            {logs.map((entry) => {
              const key = `${entry.source}-${entry.id}`;
              const expanded = expandedKey === key;
              return (
                <div key={key} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-[#6555E8] dark:text-[#988DF9]">
                        {entry.title}
                      </span>
                      <span className="text-[#73798C] dark:text-slate-400">
                        {entry.bot_username ? `@${entry.bot_username}` : 'System'} · {entry.source.toUpperCase()}
                      </span>
                      {entry.duration_ms > 0 && (
                        <span className="font-mono tabular-nums text-[#73798C] dark:text-slate-400">
                          · {entry.duration_ms}ms
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={entry.ok ? 'success' : 'danger'}
                        label={`HTTP ${entry.http_status}${entry.telegram_error_code ? ` (${entry.telegram_error_code})` : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : key)}
                        aria-label={`Inspect ${entry.title}`}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {entry.error_message && (
                    <p className="text-xs text-[#F05B75] mt-1">{entry.error_message}</p>
                  )}

                  {expanded && (
                    <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-mono text-[#73798C]">Request (Secrets Redacted)</span>
                          <CopyButton text={entry.request_payload_json || '{}'} />
                        </div>
                        <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                          {entry.request_payload_json || '{}'}
                        </pre>
                      </div>
                      <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-mono text-[#73798C]">Response · {entry.created_at}</span>
                          <CopyButton text={entry.response_payload_json} />
                        </div>
                        <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                          {entry.response_payload_json}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

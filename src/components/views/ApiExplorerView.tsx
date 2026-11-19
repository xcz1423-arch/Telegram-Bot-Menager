import React, { useEffect, useState } from 'react';
import { Play, BookmarkPlus, Trash2, Search, Code2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { API_CATEGORIES, ApiMethodDef, TELEGRAM_API_METHODS } from '../../lib/telegramSpec';
import type { BotSummary } from '../../types';
import { CopyButton, EmptyState, StatusBadge } from '../ui/Primitives';

interface SavedRequest {
  id: number;
  bot_id: number | null;
  name: string;
  method: string;
  params_json: string;
}

export function ApiExplorerView({
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
  const [mobilePanel, setMobilePanel] = useState<'methods' | 'builder' | 'response'>('builder');
  const [methodSearch, setMethodSearch] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<ApiMethodDef>(TELEGRAM_API_METHODS[0]);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [editorMode, setEditorMode] = useState<'form' | 'json'>('form');
  const [rawJsonBody, setRawJsonBody] = useState('{}');
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);
  const [saveName, setSaveName] = useState('');

  const [executing, setExecuting] = useState(false);
  const [responseState, setResponseState] = useState<{
    ok: boolean;
    httpStatus: number;
    durationMs: number;
    response: Record<string, unknown>;
  } | null>(null);
  const [prettyResponse, setPrettyResponse] = useState(true);

  const loadSaved = async () => {
    const res = await apiFetch<{ saved: SavedRequest[] }>('/api/explorer/saved');
    setSavedRequests(res.saved);
  };

  useEffect(() => {
    loadSaved();
  }, []);

  const selectMethod = (m: ApiMethodDef, prefill?: Record<string, unknown>) => {
    setSelectedMethod(m);
    const nextVals: Record<string, string | boolean> = {};
    for (const p of m.params) {
      if (prefill && prefill[p.name] !== undefined) {
        nextVals[p.name] =
          typeof prefill[p.name] === 'object' ? JSON.stringify(prefill[p.name]) : String(prefill[p.name]);
      } else if (p.defaultValue !== undefined) {
        nextVals[p.name] = typeof p.defaultValue === 'boolean' ? p.defaultValue : String(p.defaultValue);
      } else {
        nextVals[p.name] = p.type === 'boolean' ? false : '';
      }
    }
    setFormValues(nextVals);
    setRawJsonBody(JSON.stringify(prefill || {}, null, 2));
    setMobilePanel('builder');
  };

  const buildParamsObject = (): Record<string, unknown> => {
    if (editorMode === 'json') {
      return JSON.parse(rawJsonBody || '{}');
    }
    const out: Record<string, unknown> = {};
    for (const p of selectedMethod.params) {
      const val = formValues[p.name];
      if (p.type === 'boolean') {
        if (val === true) out[p.name] = true;
        continue;
      }
      const str = String(val ?? '').trim();
      if (!str) {
        if (p.required) {
          throw new Error(`Required parameter "${p.name}" is missing.`);
        }
        continue;
      }
      if (p.type === 'number') {
        const num = Number(str);
        if (!Number.isFinite(num)) throw new Error(`Parameter "${p.name}" must be numeric.`);
        out[p.name] = num;
      } else if (p.type === 'json') {
        try {
          out[p.name] = JSON.parse(str);
        } catch {
          throw new Error(`Parameter "${p.name}" must be valid JSON.`);
        }
      } else {
        out[p.name] = str;
      }
    }
    return out;
  };

  const handleExecute = async () => {
    if (!bot) return;
    let params: Record<string, unknown>;
    try {
      params = buildParamsObject();
    } catch (err) {
      onToast('error', 'Parameter Validation', err instanceof Error ? err.message : 'Invalid parameters');
      return;
    }

    setExecuting(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        httpStatus: number;
        durationMs: number;
        response: Record<string, unknown>;
      }>('/api/explorer/execute', {
        method: 'POST',
        body: JSON.stringify({ botId: bot.id, method: selectedMethod.method, params }),
      });
      setResponseState(res);
      setMobilePanel('response');
      onRefreshDashboard();
    } catch (err) {
      onToast('error', 'Execution Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExecuting(false);
    }
  };

  const handleSaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) return;
    try {
      const params = buildParamsObject();
      await apiFetch('/api/explorer/saved', {
        method: 'POST',
        body: JSON.stringify({
          botId: bot?.id || null,
          name: saveName.trim(),
          method: selectedMethod.method,
          params,
        }),
      });
      setSaveName('');
      onToast('success', 'Request Saved', `Saved ${selectedMethod.method} preset.`);
      loadSaved();
    } catch (err) {
      onToast('error', 'Could Not Save', err instanceof Error ? err.message : undefined);
    }
  };

  if (!bot) {
    return (
      <EmptyState
        icon={Code2}
        title="No Connected Bot"
        description="Connect a Telegram bot to execute methods in the API Explorer."
      />
    );
  }

  const filteredMethods = TELEGRAM_API_METHODS.filter(
    (m) =>
      m.method.toLowerCase().includes(methodSearch.toLowerCase()) ||
      m.summary.toLowerCase().includes(methodSearch.toLowerCase())
  );

  const responseText = responseState
    ? prettyResponse
      ? JSON.stringify(responseState.response, null, 2)
      : JSON.stringify(responseState.response)
    : '';

  return (
    <div className="space-y-4">
      {/* Mobile Sub-panel Switcher */}
      <div className="lg:hidden grid grid-cols-3 gap-1 p-1 rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800">
        {(['methods', 'builder', 'response'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setMobilePanel(p)}
            className={`py-2 text-xs font-medium rounded-lg capitalize ${
              mobilePanel === p ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white' : 'text-[#73798C] dark:text-slate-400'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Panel: Categories, Methods, Saved Requests */}
        <div
          className={`lg:col-span-3 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-3.5 space-y-4 ${
            mobilePanel === 'methods' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#73798C] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={methodSearch}
              onChange={(e) => setMethodSearch(e.target.value)}
              placeholder="Search methods..."
              className="w-full pl-8 pr-3 py-2 min-h-[38px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
            {API_CATEGORIES.map((cat) => {
              const items = filteredMethods.filter((m) => m.category === cat.id);
              if (items.length === 0) return null;
              return (
                <div key={cat.id}>
                  <div className="text-[11px] font-semibold text-[#73798C] dark:text-slate-400 px-2 mb-1">
                    {cat.label}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((m) => (
                      <button
                        key={m.method}
                        type="button"
                        onClick={() => selectMethod(m)}
                        className={`w-full text-left px-2.5 py-2 min-h-[36px] rounded-lg text-xs font-mono transition-colors ${
                          selectedMethod.method === m.method
                            ? 'bg-[#6555E8]/12 dark:bg-[#7565F6]/18 text-[#6555E8] dark:text-[#A599FF] font-semibold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        {m.method}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {savedRequests.length > 0 && (
            <div className="pt-3 border-t border-[#E8EAF1] dark:border-slate-800">
              <div className="text-[11px] font-semibold text-[#73798C] dark:text-slate-400 mb-1.5">Saved Presets</div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {savedRequests.map((sr) => (
                  <div key={sr.id} className="flex items-center justify-between gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const found = TELEGRAM_API_METHODS.find((m) => m.method === sr.method);
                        if (found) selectMethod(found, JSON.parse(sr.params_json));
                      }}
                      className="truncate text-left py-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex-1"
                    >
                      {sr.name}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/explorer/saved/${sr.id}`, { method: 'DELETE' });
                        loadSaved();
                      }}
                      aria-label={`Delete saved request ${sr.name}`}
                      className="p-1 text-[#F05B75]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center Panel: Request Builder */}
        <div
          className={`lg:col-span-5 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 ${
            mobilePanel === 'builder' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[#E8EAF1] dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#6555E8] dark:text-[#988DF9]">
                  {selectedMethod.method}
                </span>
                <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                  {selectedMethod.httpMethod}
                </span>
              </div>
              <p className="text-xs text-[#73798C] dark:text-slate-400 mt-1">{selectedMethod.summary}</p>
            </div>
            <select
              aria-label="Target Bot"
              value={bot.id}
              onChange={(e) => onSelectBot(Number(e.target.value))}
              className="px-2.5 py-1.5 min-h-[36px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id} data-no-smallcaps="true">
                  @{b.username}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 rounded-xl bg-[#F6F7FB] dark:bg-[#101421]">
              <button
                type="button"
                onClick={() => setEditorMode('form')}
                className={`px-3 py-1 text-xs font-medium rounded-lg ${
                  editorMode === 'form' ? 'bg-white dark:bg-[#151B2B] shadow-xs' : 'text-[#73798C]'
                }`}
              >
                Form Builder
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    setRawJsonBody(JSON.stringify(buildParamsObject(), null, 2));
                  } catch {
                    // keep current raw JSON
                  }
                  setEditorMode('json');
                }}
                className={`px-3 py-1 text-xs font-medium rounded-lg ${
                  editorMode === 'json' ? 'bg-white dark:bg-[#151B2B] shadow-xs' : 'text-[#73798C]'
                }`}
              >
                Raw JSON
              </button>
            </div>

            <button
              type="button"
              disabled={executing}
              onClick={handleExecute}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-[#20C997] hover:bg-[#18b184] text-[#090B14] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{executing ? 'Executing...' : 'Execute'}</span>
            </button>
          </div>

          {editorMode === 'json' ? (
            <textarea
              rows={10}
              value={rawJsonBody}
              onChange={(e) => setRawJsonBody(e.target.value)}
              aria-label="JSON Request Payload"
              className="w-full p-3 text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            />
          ) : selectedMethod.params.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#73798C] dark:text-slate-400">
              This method takes no parameters. Click Execute to invoke it.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedMethod.params.map((p) => (
                <div key={p.name}>
                  <label className="flex items-center justify-between text-xs font-medium mb-1">
                    <span className="font-mono">
                      {p.name}
                      {p.required && <span className="text-[#F05B75] ml-1">*</span>}
                    </span>
                    <span className="text-[10px] text-[#73798C] dark:text-slate-400">{p.type}</span>
                  </label>

                  {p.type === 'boolean' ? (
                    <label className="flex items-center gap-2 text-xs text-[#73798C] dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formValues[p.name])}
                        onChange={(e) => setFormValues({ ...formValues, [p.name]: e.target.checked })}
                      />
                      <span>{p.description}</span>
                    </label>
                  ) : p.enumValues ? (
                    <select
                      value={String(formValues[p.name] ?? '')}
                      onChange={(e) => setFormValues({ ...formValues, [p.name]: e.target.value })}
                      className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                    >
                      {p.enumValues.map((ev) => (
                        <option key={ev} value={ev}>
                          {ev || '(None)'}
                        </option>
                      ))}
                    </select>
                  ) : p.type === 'json' ? (
                    <textarea
                      rows={3}
                      value={String(formValues[p.name] ?? '')}
                      onChange={(e) => setFormValues({ ...formValues, [p.name]: e.target.value })}
                      placeholder={p.placeholder}
                      className="w-full p-2.5 text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(formValues[p.name] ?? '')}
                      onChange={(e) => setFormValues({ ...formValues, [p.name]: e.target.value })}
                      placeholder={p.placeholder}
                      className="w-full px-3 py-2 min-h-[40px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                    />
                  )}
                  {p.type !== 'boolean' && (
                    <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-0.5">{p.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSaveRequest} className="pt-3 border-t border-[#E8EAF1] dark:border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Preset name..."
              className="flex-1 px-3 py-2 min-h-[40px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            />
            <button
              type="submit"
              className="px-3 py-2 min-h-[40px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </form>
        </div>

        {/* Right Panel: Response Viewer */}
        <div
          className={`lg:col-span-4 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 ${
            mobilePanel === 'response' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Response</h3>
            {responseState && (
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={responseState.ok ? 'success' : 'danger'}
                  label={`${responseState.httpStatus} · ${responseState.durationMs}ms`}
                />
              </div>
            )}
          </div>

          {!responseState ? (
            <div className="py-16 text-center text-xs text-[#73798C] dark:text-slate-400">
              Select a method and click Execute to inspect the Telegram API response.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 p-1 rounded-lg bg-[#F6F7FB] dark:bg-[#101421]">
                  <button
                    type="button"
                    onClick={() => setPrettyResponse(true)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md ${
                      prettyResponse ? 'bg-white dark:bg-[#151B2B] shadow-xs' : 'text-[#73798C]'
                    }`}
                  >
                    Pretty
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrettyResponse(false)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md ${
                      !prettyResponse ? 'bg-white dark:bg-[#151B2B] shadow-xs' : 'text-[#73798C]'
                    }`}
                  >
                    Raw
                  </button>
                </div>
                <CopyButton text={responseText} />
              </div>

              <pre className="p-3 rounded-xl bg-[#0F172A] text-slate-100 text-[11px] font-mono overflow-x-auto max-h-[460px] whitespace-pre-wrap break-all">
                {responseText}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

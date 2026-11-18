import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Send,
  Download,
  GripVertical,
} from 'lucide-react';
import { apiFetch, downloadBlob } from '../../lib/api';
import { InlineButtonDef, validateInlineKeyboard } from '../../lib/telegramSpec';
import type { BotSummary, KeyboardTemplate } from '../../types';
import { CopyButton } from '../ui/Primitives';

const uid = () => Math.random().toString(36).slice(2, 9);

export function KeyboardBuilderView({
  bots,
  activeBotId,
  onUseInMessageCenter,
  onToast,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onUseInMessageCenter: (markupJson: string) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const [rows, setRows] = useState<InlineButtonDef[][]>([
    [
      { id: uid(), text: 'Check Status', type: 'callback_data', value: 'status_check' },
      { id: uid(), text: 'Open Docs', type: 'url', value: 'https://core.telegram.org/bots/api' },
    ],
    [{ id: uid(), text: 'Launch Mini App', type: 'web_app', value: 'https://t.me' }],
  ]);
  const [selectedCoords, setSelectedCoords] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<KeyboardTemplate[]>([]);
  const [dragFrom, setDragFrom] = useState<{ r: number; c: number } | null>(null);

  const loadTemplates = async () => {
    const res = await apiFetch<{ templates: KeyboardTemplate[] }>('/api/templates');
    setTemplates(res.templates);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const validation = validateInlineKeyboard(rows);
  const jsonPretty = JSON.stringify(validation.markup, null, 2);
  const selectedBtn = rows[selectedCoords.r]?.[selectedCoords.c] || null;

  const addRow = () => {
    const next = [...rows, [{ id: uid(), text: 'New Button', type: 'callback_data' as const, value: 'action_1' }]];
    setRows(next);
    setSelectedCoords({ r: next.length - 1, c: 0 });
  };

  const removeRow = (rIdx: number) => {
    if (rows.length <= 1) return;
    const next = rows.filter((_, i) => i !== rIdx);
    setRows(next);
    setSelectedCoords({ r: 0, c: 0 });
  };

  const addButtonToRow = (rIdx: number) => {
    if (rows[rIdx].length >= 8) {
      onToast('error', 'Row Limit', 'Telegram allows at most 8 buttons per row.');
      return;
    }
    const next = rows.map((row, i) =>
      i === rIdx ? [...row, { id: uid(), text: 'Button', type: 'callback_data' as const, value: 'btn_tap' }] : row
    );
    setRows(next);
    setSelectedCoords({ r: rIdx, c: next[rIdx].length - 1 });
  };

  const deleteButton = (rIdx: number, cIdx: number) => {
    const next = rows
      .map((row, i) => (i === rIdx ? row.filter((_, j) => j !== cIdx) : row))
      .filter((r) => r.length > 0);
    setRows(next.length ? next : [[{ id: uid(), text: 'Button', type: 'callback_data', value: 'btn_1' }]]);
    setSelectedCoords({ r: 0, c: 0 });
  };

  const updateSelected = (patch: Partial<InlineButtonDef>) => {
    setRows((prev) =>
      prev.map((row, r) =>
        r === selectedCoords.r
          ? row.map((btn, c) => (c === selectedCoords.c ? { ...btn, ...patch } : btn))
          : row
      )
    );
  };

  const moveButton = (rIdx: number, cIdx: number, dir: -1 | 1) => {
    const row = rows[rIdx];
    const targetIdx = cIdx + dir;
    if (targetIdx < 0 || targetIdx >= row.length) return;
    const copy = [...row];
    const [item] = copy.splice(cIdx, 1);
    copy.splice(targetIdx, 0, item);
    setRows(rows.map((r, i) => (i === rIdx ? copy : r)));
    setSelectedCoords({ r: rIdx, c: targetIdx });
  };

  const handleDrop = (toR: number, toC: number) => {
    if (!dragFrom) return;
    const copy = rows.map((r) => [...r]);
    const [moved] = copy[dragFrom.r].splice(dragFrom.c, 1);
    if (!moved) return;
    copy[toR].splice(toC, 0, moved);
    const cleaned = copy.filter((r) => r.length > 0);
    setRows(cleaned);
    setDragFrom(null);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid) {
      onToast('error', 'Validation Error', validation.error);
      return;
    }
    if (!templateName.trim()) {
      onToast('error', 'Template Name Required', 'Enter a name to save this keyboard template.');
      return;
    }
    await apiFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: templateName.trim(),
        botId: activeBotId || bots[0]?.id || null,
        payload: validation.markup,
      }),
    });
    onToast('success', 'Template Saved', `"${templateName.trim()}" saved to library.`);
    setTemplateName('');
    loadTemplates();
  };

  const handleLoadTemplate = (tpl: KeyboardTemplate) => {
    try {
      const parsed = JSON.parse(tpl.payload_json) as { inline_keyboard?: Array<Array<Record<string, unknown>>> };
      if (!Array.isArray(parsed.inline_keyboard)) return;
      const converted: InlineButtonDef[][] = parsed.inline_keyboard.map((row) =>
        row.map((btn) => {
          if (typeof btn.url === 'string') return { id: uid(), text: String(btn.text || 'Link'), type: 'url', value: btn.url };
          if (btn.web_app && typeof (btn.web_app as { url?: string }).url === 'string')
            return { id: uid(), text: String(btn.text || 'App'), type: 'web_app', value: (btn.web_app as { url: string }).url };
          if (btn.login_url && typeof (btn.login_url as { url?: string }).url === 'string')
            return { id: uid(), text: String(btn.text || 'Login'), type: 'login_url', value: (btn.login_url as { url: string }).url };
          return { id: uid(), text: String(btn.text || 'Action'), type: 'callback_data', value: String(btn.callback_data || 'cb') };
        })
      );
      if (converted.length > 0) {
        setRows(converted);
        setSelectedCoords({ r: 0, c: 0 });
      }
    } catch {
      onToast('error', 'Corrupt Template', 'Could not parse keyboard template JSON.');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* Left: Visual Row & Drag-and-Drop Editor */}
      <div className="xl:col-span-7 space-y-4">
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Visual Keyboard Canvas</h2>
              <p className="text-xs text-[#73798C] dark:text-slate-400">Drag buttons to reorder, or tap any button to edit its payload</p>
            </div>
            <button
              type="button"
              onClick={addRow}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, rIdx) => (
              <div
                key={rIdx}
                className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#73798C] dark:text-slate-400">Row {rIdx + 1}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => addButtonToRow(rIdx)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-700 text-[11px] font-medium inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Button
                    </button>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(rIdx)}
                        aria-label={`Remove row ${rIdx + 1}`}
                        className="p-1.5 rounded-lg text-[#F05B75] hover:bg-[#F05B75]/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.map((btn, cIdx) => {
                    const active = selectedCoords.r === rIdx && selectedCoords.c === cIdx;
                    return (
                      <div
                        key={btn.id}
                        draggable
                        onDragStart={() => setDragFrom({ r: rIdx, c: cIdx })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(rIdx, cIdx)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-colors ${
                          active
                            ? 'bg-[#6555E8]/12 dark:bg-[#7565F6]/20 border-[#7565F6] text-[#171A2B] dark:text-white'
                            : 'bg-white dark:bg-[#151B2B] border-[#E8EAF1] dark:border-slate-700'
                        }`}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-[#73798C] cursor-grab shrink-0" />
                        <button
                          type="button"
                          onClick={() => setSelectedCoords({ r: rIdx, c: cIdx })}
                          className="font-medium min-h-[32px] px-1 text-left"
                        >
                          {btn.text}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveButton(rIdx, cIdx, -1)}
                          aria-label="Move button left"
                          className="p-1 text-[#73798C] hover:text-[#171A2B] dark:hover:text-white"
                        >
                          <ArrowUp className="w-3 h-3 -rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveButton(rIdx, cIdx, 1)}
                          aria-label="Move button right"
                          className="p-1 text-[#73798C] hover:text-[#171A2B] dark:hover:text-white"
                        >
                          <ArrowDown className="w-3 h-3 -rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteButton(rIdx, cIdx)}
                          aria-label={`Delete ${btn.text}`}
                          className="p-1 text-[#F05B75]"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Button Inspector */}
        {selectedBtn && (
          <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-xs font-semibold">Edit Selected Button (Row {selectedCoords.r + 1}, Col {selectedCoords.c + 1})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1">Button Label</label>
                <input
                  type="text"
                  value={selectedBtn.text}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Action Type</label>
                <select
                  value={selectedBtn.type}
                  onChange={(e) => updateSelected({ type: e.target.value as InlineButtonDef['type'] })}
                  className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="callback_data">Callback Data</option>
                  <option value="url">URL</option>
                  <option value="web_app">Web App (HTTPS)</option>
                  <option value="login_url">Login URL (HTTPS)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">
                  {selectedBtn.type === 'callback_data' ? 'Callback Data (<=64 bytes)' : 'Target URL'}
                </label>
                <input
                  type="text"
                  value={selectedBtn.value}
                  onChange={(e) => updateSelected({ value: e.target.value })}
                  className="w-full px-3 py-2 min-h-[40px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                />
              </div>
            </div>
            {!validation.valid && (
              <div role="alert" className="text-xs text-[#C72544] dark:text-[#F05B75]">
                {validation.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Live Telegram Preview, JSON, Templates */}
      <div className="xl:col-span-5 space-y-4">
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Live Telegram Keyboard Preview</h3>
            <button
              type="button"
              disabled={!validation.valid}
              onClick={() => onUseInMessageCenter(jsonPretty)}
              className="px-3 py-1.5 min-h-[36px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Use in Composer</span>
            </button>
          </div>

          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 p-4 space-y-1.5">
            <div className="rounded-2xl rounded-bl-sm bg-[#1E293B] text-slate-200 p-3 text-xs">
              Select an action below:
            </div>
            {rows.map((row, rIdx) => (
              <div
                key={rIdx}
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
              >
                {row.map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => onToast('info', `Preview Tap: ${btn.text}`, `${btn.type}: ${btn.value}`)}
                    className="py-2 px-2 rounded-lg bg-[#1E293B] hover:bg-slate-700 border border-slate-700/60 text-slate-100 text-xs font-medium truncate"
                  >
                    {btn.text}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Serialized JSON</span>
              <div className="flex items-center gap-1.5">
                <CopyButton text={jsonPretty} />
                <button
                  type="button"
                  onClick={() => downloadBlob(jsonPretty, 'inline-keyboard.json')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border border-[#E8EAF1] dark:border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
              </div>
            </div>
            <pre className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 text-[11px] font-mono overflow-x-auto max-h-48">
              {jsonPretty}
            </pre>
          </div>
        </div>

        {/* Save & Load Templates */}
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-semibold">Saved Templates</h3>
          <form onSubmit={handleSaveTemplate} className="flex items-center gap-2">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 px-3 py-2 min-h-[40px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            />
            <button
              type="submit"
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-[#20C997] text-[#090B14] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </form>

          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] text-xs"
              >
                <button
                  type="button"
                  onClick={() => handleLoadTemplate(t)}
                  className="font-medium text-left truncate hover:text-[#6555E8] dark:hover:text-[#988DF9] flex-1"
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/templates/${t.id}`, { method: 'DELETE' });
                    loadTemplates();
                  }}
                  aria-label={`Delete template ${t.name}`}
                  className="p-1 text-[#F05B75]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

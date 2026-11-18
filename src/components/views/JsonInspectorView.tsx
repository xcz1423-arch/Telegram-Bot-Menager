import React, { useState } from 'react';
import { Braces, Minimize2, Maximize2, Download, ChevronRight, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { downloadBlob } from '../../lib/api';
import { formatJsonPretty, minifyJson } from '../../lib/telegramSpec';
import { CopyButton } from '../ui/Primitives';

const SAMPLE_UPDATE = JSON.stringify(
  {
    update_id: 89412055,
    message: {
      message_id: 512,
      from: { id: 104829104, is_bot: false, first_name: 'Sara', username: 'sara_lin', language_code: 'en' },
      chat: { id: 104829104, first_name: 'Sara', username: 'sara_lin', type: 'private' },
      date: 1795012000,
      text: '/orders #XC-4921',
      entities: [{ offset: 0, length: 7, type: 'bot_command' }],
    },
  },
  null,
  2
);

function JsonTreeNode({
  name,
  value,
  searchQuery,
  depth = 0,
}: {
  name?: string;
  value: unknown;
  searchQuery: string;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const isObj = value !== null && typeof value === 'object';

  const matchesSearch =
    searchQuery.trim() !== '' &&
    ((name && name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (!isObj && String(value).toLowerCase().includes(searchQuery.toLowerCase())));

  if (!isObj) {
    const colorClass =
      typeof value === 'string'
        ? 'text-[#20C997]'
        : typeof value === 'number'
        ? 'text-[#22C8F6]'
        : typeof value === 'boolean'
        ? 'text-[#F5B942]'
        : 'text-slate-400';

    return (
      <div className={`font-mono text-xs py-0.5 pl-4 flex items-baseline gap-1.5 ${matchesSearch ? 'bg-[#7565F6]/25 rounded' : ''}`}>
        {name !== undefined && <span className="text-[#A599FF]">"{name}":</span>}
        <span className={`${colorClass} break-all`}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  const openBracket = Array.isArray(value) ? '[' : '{';
  const closeBracket = Array.isArray(value) ? ']' : '}';

  return (
    <div className="font-mono text-xs">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={`flex items-center gap-1 py-0.5 hover:bg-slate-800/40 rounded px-1 text-left ${matchesSearch ? 'bg-[#7565F6]/25' : ''}`}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        {name !== undefined && <span className="text-[#A599FF]">"{name}":</span>}
        <span className="text-slate-300">
          {openBracket}
          {collapsed ? ` ... ${entries.length} items ${closeBracket}` : ''}
        </span>
      </button>
      {!collapsed && (
        <div className="pl-4 border-l border-slate-700/60 ml-2">
          {entries.map(([k, v]) => (
            <JsonTreeNode key={k} name={Array.isArray(value) ? undefined : k} value={v} searchQuery={searchQuery} depth={depth + 1} />
          ))}
          <div className="text-slate-300 pl-1">{closeBracket}</div>
        </div>
      )}
    </div>
  );
}

export function JsonInspectorView() {
  const [input, setInput] = useState(SAMPLE_UPDATE);
  const [searchQuery, setSearchQuery] = useState('');

  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    parseError = err instanceof Error ? err.message : 'Invalid JSON syntax';
  }

  const handleFormat = () => {
    const res = formatJsonPretty(input);
    if (res.ok && res.output) setInput(res.output);
  };

  const handleMinify = () => {
    const res = minifyJson(input);
    if (res.ok && res.output) setInput(res.output);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          {parseError ? (
            <span className="inline-flex items-center gap-1.5 text-[#F05B75] font-medium">
              <AlertCircle className="w-4 h-4" />
              <span>Syntax Error: {parseError}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#118A66] dark:text-[#20C997] font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Valid JSON ({new Blob([input]).size} bytes)</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleFormat}
            className="px-3 py-1.5 min-h-[36px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Format</span>
          </button>
          <button
            type="button"
            onClick={handleMinify}
            className="px-3 py-1.5 min-h-[36px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Minify</span>
          </button>
          <CopyButton text={input} />
          <button
            type="button"
            onClick={() => downloadBlob(input, 'payload.json')}
            className="px-3 py-1.5 min-h-[36px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Braces className="w-4 h-4 text-[#7565F6]" />
            <span>Raw JSON Input</span>
          </div>
          <textarea
            rows={18}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="JSON Editor"
            className="w-full p-3 text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
          />
        </div>

        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 space-y-3 text-slate-100">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Collapsible Tree Inspector</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Highlight key or value..."
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            />
          </div>

          <div className="max-h-[420px] overflow-auto">
            {parseError ? (
              <div className="p-4 rounded-xl bg-[#F05B75]/15 border border-[#F05B75]/30 text-xs font-mono text-[#F05B75]">
                {parseError}
              </div>
            ) : (
              <JsonTreeNode value={parsed} searchQuery={searchQuery} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

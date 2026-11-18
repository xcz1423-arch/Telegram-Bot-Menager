import React, { useState } from 'react';

export interface TimeSeriesPoint {
  date: string;
  messages_sent: number;
  updates_received: number;
  api_requests: number;
  api_success?: number;
  api_failed?: number;
}

export function ActivityTimelineChart({ data }: { data: TimeSeriesPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-[#73798C] dark:text-slate-400">
        No activity series recorded for this period yet.
      </div>
    );
  }

  const width = 680;
  const height = 220;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const maxVal = Math.max(
    10,
    ...data.map((d) => Math.max(d.api_requests || 0, d.updates_received || 0, d.messages_sent || 0))
  );

  const getX = (i: number) => (data.length === 1 ? padL + chartW / 2 : padL + (i / (data.length - 1)) * chartW);
  const getY = (val: number) => padT + chartH - (val / maxVal) * chartH;

  const buildPath = (getter: (d: TimeSeriesPoint) => number) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(getter(d)).toFixed(1)}`).join(' ');

  const buildArea = (getter: (d: TimeSeriesPoint) => number) => {
    const line = buildPath(getter);
    return `${line} L ${getX(data.length - 1).toFixed(1)} ${(padT + chartH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padT + chartH).toFixed(1)} Z`;
  };

  const active = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#171A2B] dark:text-slate-200">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#7565F6]" />
            API Requests
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#171A2B] dark:text-slate-200">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#22C8F6]" />
            Updates
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#171A2B] dark:text-slate-200">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#20C997]" />
            Messages
          </span>
        </div>
        {active && (
          <div className="font-mono tabular-nums text-[11px] text-[#73798C] dark:text-slate-400">
            {active.date} · Req {active.api_requests} · Upd {active.updates_received} · Msg {active.messages_sent}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 overflow-visible select-none"
        role="img"
        aria-label="Bot activity timeline chart"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="xcAreaPrimary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7565F6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#7565F6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + chartH * (1 - t);
          const label = Math.round(maxVal * t);
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                className="stroke-[#E8EAF1] dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-[#73798C] dark:fill-slate-500 text-[10px] font-mono tabular-nums"
              >
                {label}
              </text>
            </g>
          );
        })}

        <path d={buildArea((d) => d.api_requests || 0)} fill="url(#xcAreaPrimary)" />
        <path d={buildPath((d) => d.api_requests || 0)} fill="none" stroke="#7565F6" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={buildPath((d) => d.updates_received || 0)} fill="none" stroke="#22C8F6" strokeWidth="2" strokeLinejoin="round" />
        <path d={buildPath((d) => d.messages_sent || 0)} fill="none" stroke="#20C997" strokeWidth="2" strokeLinejoin="round" />

        {data.map((d, i) => {
          const x = getX(i);
          const showLabel = i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0;
          return (
            <g key={d.date}>
              {showLabel && (
                <text
                  x={x}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-[#73798C] dark:fill-slate-500 text-[10px] font-mono"
                >
                  {d.date.slice(5)}
                </text>
              )}
              <rect
                x={x - chartW / Math.max(data.length * 2, 4)}
                y={padT}
                width={chartW / Math.max(data.length, 2)}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onClick={() => setHoverIdx(i)}
              />
            </g>
          );
        })}

        {hoverIdx !== null && data[hoverIdx] && (
          <g>
            <line
              x1={getX(hoverIdx)}
              x2={getX(hoverIdx)}
              y1={padT}
              y2={padT + chartH}
              stroke="#7565F6"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <circle cx={getX(hoverIdx)} cy={getY(data[hoverIdx].api_requests || 0)} r="4" fill="#7565F6" />
            <circle cx={getX(hoverIdx)} cy={getY(data[hoverIdx].updates_received || 0)} r="3.5" fill="#22C8F6" />
            <circle cx={getX(hoverIdx)} cy={getY(data[hoverIdx].messages_sent || 0)} r="3.5" fill="#20C997" />
          </g>
        )}
      </svg>
    </div>
  );
}

export function SuccessRateDonut({
  success,
  failed,
}: {
  success: number;
  failed: number;
}) {
  const total = success + failed;
  const pct = total > 0 ? Math.round((success / total) * 1000) / 10 : 100;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const successArc = total > 0 ? (success / total) * circ : circ;

  return (
    <div className="flex items-center gap-5">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" role="img" aria-label={`API Success Rate ${pct}%`}>
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="10"
            className="stroke-[#F05B75]/30 dark:stroke-[#F05B75]/35"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="10"
            stroke="#20C997"
            strokeDasharray={`${successArc} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold font-mono tabular-nums text-[#171A2B] dark:text-white">{pct}%</span>
          <span className="text-[10px] text-[#73798C] dark:text-slate-400">Success</span>
        </div>
      </div>

      <div className="space-y-2 text-xs min-w-0">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#73798C] dark:text-slate-300">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#20C997]" />
            Successful
          </span>
          <span className="font-mono font-semibold tabular-nums">{success.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#73798C] dark:text-slate-300">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#F05B75]" />
            Failed
          </span>
          <span className="font-mono font-semibold tabular-nums">{failed.toLocaleString()}</span>
        </div>
        <div className="pt-1 border-t border-[#E8EAF1] dark:border-slate-800 flex items-center justify-between gap-4">
          <span className="text-[#73798C] dark:text-slate-400">Total Requests</span>
          <span className="font-mono font-semibold tabular-nums">{total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

export function HorizontalBarBreakdown({
  items,
}: {
  items: { label: string; sublabel?: string; value: number; color?: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="text-xs text-[#73798C] dark:text-slate-400 py-4">No records available.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-medium truncate text-[#171A2B] dark:text-slate-200">
              {item.label}
              {item.sublabel && <span className="text-[#73798C] dark:text-slate-400 font-normal ml-1.5">{item.sublabel}</span>}
            </span>
            <span className="font-mono tabular-nums text-[#73798C] dark:text-slate-300 shrink-0">
              {item.value.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(4, Math.round((item.value / max) * 100))}%`,
                backgroundColor: item.color || '#7565F6',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

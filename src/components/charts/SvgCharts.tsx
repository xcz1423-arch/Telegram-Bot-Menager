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
  const height = 228;
  const padL = 38;
  const padR = 26;
  const padT = 24;
  const padB = 30;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const isSingleDay = data.length === 1;
  const single = data[0];
  const plotPoints: Array<{
    date: string;
    axisLabel: string;
    api_requests: number;
    updates_received: number;
    messages_sent: number;
    isSummary?: boolean;
  }> = isSingleDay
    ? [
        {
          date: single.date,
          axisLabel: '00:00',
          api_requests: 0,
          updates_received: 0,
          messages_sent: 0,
          isSummary: true,
        },
        {
          date: single.date,
          axisLabel: '08:00',
          api_requests: Math.round((single.api_requests || 0) * 0.24),
          updates_received: Math.round((single.updates_received || 0) * 0.22),
          messages_sent: Math.round((single.messages_sent || 0) * 0.25),
          isSummary: true,
        },
        {
          date: single.date,
          axisLabel: '16:00',
          api_requests: Math.round((single.api_requests || 0) * 0.62),
          updates_received: Math.round((single.updates_received || 0) * 0.58),
          messages_sent: Math.round((single.messages_sent || 0) * 0.65),
          isSummary: true,
        },
        {
          date: single.date,
          axisLabel: single.date.slice(5),
          api_requests: single.api_requests || 0,
          updates_received: single.updates_received || 0,
          messages_sent: single.messages_sent || 0,
        },
      ]
    : data.map((d) => ({
        date: d.date,
        axisLabel: d.date.slice(5),
        api_requests: d.api_requests || 0,
        updates_received: d.updates_received || 0,
        messages_sent: d.messages_sent || 0,
      }));

  const maxRaw = Math.max(
    1,
    ...plotPoints.map((d) => Math.max(d.api_requests, d.updates_received, d.messages_sent))
  );
  const maxVal = Math.max(4, Math.ceil(maxRaw * 1.15));

  const getX = (i: number) => padL + (i / Math.max(1, plotPoints.length - 1)) * chartW;
  const getY = (val: number) => padT + chartH - (val / maxVal) * chartH;

  const buildSmoothPath = (getter: (d: (typeof plotPoints)[number]) => number) => {
    const pts = plotPoints.map((d, i) => ({ x: getX(i), y: getY(getter(d)) }));
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = ((p0.x + p1.x) / 2).toFixed(1);
      path += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    return path;
  };

  const buildArea = (getter: (d: (typeof plotPoints)[number]) => number) => {
    const line = buildSmoothPath(getter);
    return `${line} L ${getX(plotPoints.length - 1).toFixed(1)} ${(padT + chartH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padT + chartH).toFixed(1)} Z`;
  };

  const activeIdx = hoverIdx !== null && plotPoints[hoverIdx] ? hoverIdx : plotPoints.length - 1;
  const active = isSingleDay ? single : plotPoints[activeIdx];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5 text-[#171A2B] dark:text-slate-200 font-medium">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#7565F6] shadow-[0_0_8px_rgba(117,101,246,0.55)]" />
            API Requests
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#171A2B] dark:text-slate-200 font-medium">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#22C8F6] shadow-[0_0_8px_rgba(34,200,246,0.55)]" />
            Updates
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#171A2B] dark:text-slate-200 font-medium">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#20C997] shadow-[0_0_8px_rgba(32,201,151,0.55)]" />
            Messages
          </span>
        </div>
        {active && (
          <div className="px-2.5 py-1 rounded-lg bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 font-mono tabular-nums text-[11px] text-[#171A2B] dark:text-slate-300">
            {active.date} · Req <span className="text-[#7565F6] font-semibold">{active.api_requests}</span> · Upd{' '}
            <span className="text-[#22C8F6] font-semibold">{active.updates_received}</span> · Msg{' '}
            <span className="text-[#20C997] font-semibold">{active.messages_sent}</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible select-none"
        role="img"
        aria-label="Bot activity timeline graph"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="xcAreaPrimary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7565F6" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#7565F6" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="xcAreaCyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C8F6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#22C8F6" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="xcAreaEmerald" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#20C997" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#20C997" stopOpacity="0.0" />
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
                strokeDasharray={t > 0 && t < 1 ? '3 3' : undefined}
                className="stroke-[#E8EAF1] dark:stroke-slate-800/90"
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

        {/* Smooth Glowing Area Fills */}
        <path d={buildArea((d) => d.api_requests)} fill="url(#xcAreaPrimary)" />
        <path d={buildArea((d) => d.messages_sent)} fill="url(#xcAreaEmerald)" />
        <path d={buildArea((d) => d.updates_received)} fill="url(#xcAreaCyan)" />

        {/* Smooth Bezier Spline Curves */}
        <path
          d={buildSmoothPath((d) => d.api_requests)}
          fill="none"
          stroke="#7565F6"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={buildSmoothPath((d) => d.messages_sent)}
          fill="none"
          stroke="#20C997"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={buildSmoothPath((d) => d.updates_received)}
          fill="none"
          stroke="#22C8F6"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Nodes, X-axis labels & hover regions */}
        {plotPoints.map((d, i) => {
          const x = getX(i);
          const showLabel =
            isSingleDay || i === 0 || i === plotPoints.length - 1 || i % Math.ceil(plotPoints.length / 5) === 0;
          const isSelected = activeIdx === i;
          const isPeakEnd = i === plotPoints.length - 1;
          return (
            <g key={`${d.axisLabel}-${i}`}>
              {showLabel && (
                <text
                  x={x}
                  y={height - 6}
                  textAnchor="middle"
                  className={`text-[10px] font-mono ${
                    isSelected
                      ? 'fill-[#171A2B] dark:fill-slate-200 font-semibold'
                      : 'fill-[#73798C] dark:fill-slate-500'
                  }`}
                >
                  {d.axisLabel}
                </text>
              )}

              {(plotPoints.length <= 14 || isSelected) && (
                <>
                  {isSelected && (
                    <circle cx={x} cy={getY(d.api_requests)} r={8} fill="#7565F6" fillOpacity="0.18" />
                  )}
                  <circle
                    cx={x}
                    cy={getY(d.api_requests)}
                    r={isSelected ? 4.5 : 3}
                    fill="#7565F6"
                    stroke="#0F172A"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={x}
                    cy={getY(d.messages_sent)}
                    r={isSelected ? 4 : 2.6}
                    fill="#20C997"
                    stroke="#0F172A"
                    strokeWidth="1.2"
                  />
                  <circle
                    cx={x}
                    cy={getY(d.updates_received)}
                    r={isSelected ? 4 : 2.6}
                    fill="#22C8F6"
                    stroke="#0F172A"
                    strokeWidth="1.2"
                  />
                </>
              )}

              {isSingleDay && isPeakEnd && (
                <g>
                  <text
                    x={x}
                    y={Math.max(padT - 6, getY(d.api_requests) - 10)}
                    textAnchor="middle"
                    className="fill-[#7565F6] text-[10px] font-mono font-bold tabular-nums"
                  >
                    {d.api_requests}
                  </text>
                </g>
              )}

              {!isSingleDay && (
                <rect
                  x={x - chartW / Math.max(plotPoints.length * 2, 4)}
                  y={padT}
                  width={chartW / Math.max(plotPoints.length, 2)}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => setHoverIdx(i)}
                />
              )}
            </g>
          );
        })}

        {hoverIdx !== null && !isSingleDay && plotPoints[hoverIdx] && (
          <line
            x1={getX(hoverIdx)}
            x2={getX(hoverIdx)}
            y1={padT}
            y2={padT + chartH}
            stroke="#7565F6"
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />
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
  items: { label: string; sublabel?: string; value: number; color?: string; noSmallCaps?: boolean }[];
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
            <span
              data-no-smallcaps={item.noSmallCaps ? 'true' : undefined}
              className="font-medium truncate text-[#171A2B] dark:text-slate-200"
            >
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

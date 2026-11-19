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
  const padR = 18;
  const padT = 22;
  const padB = 30;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const maxRaw = Math.max(
    1,
    ...data.map((d) => Math.max(d.api_requests || 0, d.updates_received || 0, d.messages_sent || 0))
  );
  const maxVal = Math.max(4, Math.ceil(maxRaw * 1.15));

  const getX = (i: number) =>
    data.length === 1 ? padL + chartW / 2 : padL + (i / (data.length - 1)) * chartW;
  const getY = (val: number) => padT + chartH - (val / maxVal) * chartH;

  const buildSmoothPath = (getter: (d: TimeSeriesPoint) => number) => {
    const pts = data.map((d, i) => ({ x: getX(i), y: getY(getter(d)) }));
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

  const buildArea = (getter: (d: TimeSeriesPoint) => number) => {
    const line = buildSmoothPath(getter);
    return `${line} L ${getX(data.length - 1).toFixed(1)} ${(padT + chartH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padT + chartH).toFixed(1)} Z`;
  };

  const activeIdx = hoverIdx !== null ? hoverIdx : data.length - 1;
  const active = data[activeIdx];
  const showSparseBars = data.length <= 5;

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
        aria-label="Bot activity timeline chart"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="xcAreaPrimary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7565F6" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#7565F6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="xcAreaCyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C8F6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#22C8F6" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="xcBarReq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8E7FFF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6555E8" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="xcBarUpd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4CE0FF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#22C8F6" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="xcBarMsg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3BE4B0" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#20C997" stopOpacity="0.55" />
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

        {showSparseBars ? (
          /* Crisp grouped vertical gradient bars when there are 1 to 5 days so single-day views look rich */
          <g>
            {data.map((d, i) => {
              const cx = data.length === 1 ? padL + chartW / 2 : padL + ((i + 0.5) / data.length) * chartW;
              const barW = data.length === 1 ? 42 : Math.min(26, Math.max(12, Math.floor(chartW / (data.length * 5))));
              const gap = data.length === 1 ? 18 : 6;
              const baseY = padT + chartH;

              const bars = [
                { val: d.api_requests || 0, fill: 'url(#xcBarReq)', stroke: '#7565F6', dx: -(barW + gap) },
                { val: d.updates_received || 0, fill: 'url(#xcBarUpd)', stroke: '#22C8F6', dx: 0 },
                { val: d.messages_sent || 0, fill: 'url(#xcBarMsg)', stroke: '#20C997', dx: barW + gap },
              ];

              return (
                <g key={d.date}>
                  {bars.map((b, bIdx) => {
                    const y = getY(b.val);
                    const h = Math.max(b.val > 0 ? 6 : 2, baseY - y);
                    const rx = Math.min(6, barW / 2);
                    const x = cx + b.dx - barW / 2;
                    return (
                      <g key={bIdx}>
                        <rect
                          x={x}
                          y={baseY - h}
                          width={barW}
                          height={h}
                          rx={rx}
                          fill={b.fill}
                          stroke={b.stroke}
                          strokeOpacity={b.val > 0 ? 0.55 : 0.2}
                          strokeWidth="1"
                        />
                        {data.length <= 3 && (
                          <text
                            x={x + barW / 2}
                            y={baseY - h - 6}
                            textAnchor="middle"
                            className="fill-[#171A2B] dark:fill-slate-200 text-[10px] font-mono font-semibold tabular-nums"
                          >
                            {b.val}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text
                    x={cx}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-[#73798C] dark:fill-slate-400 text-[10px] font-mono"
                  >
                    {d.date.slice(5)}
                  </text>
                  <rect
                    x={cx - (barW * 2 + gap * 1.5)}
                    y={padT}
                    width={barW * 4 + gap * 3}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onClick={() => setHoverIdx(i)}
                  />
                </g>
              );
            })}
          </g>
        ) : (
          /* Multi-day smooth area + lines + glowing data nodes */
          <g>
            <path d={buildArea((d) => d.api_requests || 0)} fill="url(#xcAreaPrimary)" />
            <path d={buildArea((d) => d.updates_received || 0)} fill="url(#xcAreaCyan)" />
            <path
              d={buildSmoothPath((d) => d.api_requests || 0)}
              fill="none"
              stroke="#7565F6"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={buildSmoothPath((d) => d.updates_received || 0)}
              fill="none"
              stroke="#22C8F6"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={buildSmoothPath((d) => d.messages_sent || 0)}
              fill="none"
              stroke="#20C997"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {data.map((d, i) => {
              const x = getX(i);
              const showLabel = i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0;
              const isSelected = activeIdx === i;
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
                  {(data.length <= 14 || isSelected) && (
                    <>
                      <circle cx={x} cy={getY(d.api_requests || 0)} r={isSelected ? 4.5 : 3} fill="#7565F6" stroke="#0F172A" strokeWidth="1.5" />
                      <circle cx={x} cy={getY(d.updates_received || 0)} r={isSelected ? 4 : 2.5} fill="#22C8F6" stroke="#0F172A" strokeWidth="1.2" />
                      <circle cx={x} cy={getY(d.messages_sent || 0)} r={isSelected ? 4 : 2.5} fill="#20C997" stroke="#0F172A" strokeWidth="1.2" />
                    </>
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

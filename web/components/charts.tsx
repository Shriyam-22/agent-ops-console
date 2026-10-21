// Small hand-built SVG charts, rendered on the server. No chart library needed.
import { compact, shortDay } from "@/lib/format";

type Day = { day: string; turns: number; escalations: number; cost_usd: number; p95_latency_ms: number };

const niceMax = (n: number) => {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
};

/** Bars for conversations per day, with escalations drawn as a line on a second scale. */
export function TrafficChart({ data }: { data: Day[] }) {
  const W = 640;
  const H = 220;
  const pad = { l: 36, r: 36, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxTurns = niceMax(Math.max(...data.map((d) => d.turns), 1));
  const maxEsc = niceMax(Math.max(...data.map((d) => d.escalations), 1));
  const step = iw / data.length;
  const bw = Math.min(28, step * 0.62);
  const x = (i: number) => pad.l + step * i + step / 2;
  const yT = (v: number) => pad.t + ih - (v / maxTurns) * ih;
  const yE = (v: number) => pad.t + ih - (v / maxEsc) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yE(d.escalations).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Conversation turns and escalations per day">
      <defs>
        <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9D8FFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#9D8FFF" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - f)} y2={pad.t + ih * (1 - f)} stroke="white" strokeOpacity="0.06" />
          <text x={pad.l - 8} y={pad.t + ih * (1 - f) + 4} textAnchor="end" className="fill-fog-500 font-mono text-[10px]">
            {compact(maxTurns * f)}
          </text>
          <text x={W - pad.r + 8} y={pad.t + ih * (1 - f) + 4} className="fill-lime/70 font-mono text-[10px]">
            {Math.round(maxEsc * f)}
          </text>
        </g>
      ))}
      {data.map((d, i) => (
        <g key={d.day}>
          <rect x={x(i) - bw / 2} y={yT(d.turns)} width={bw} height={Math.max(0, pad.t + ih - yT(d.turns))} rx="4" fill="url(#bar)">
            <title>{`${shortDay(d.day)}: ${d.turns} turns, ${d.escalations} escalations`}</title>
          </rect>
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-fog-500 font-mono text-[10px]">
              {shortDay(d.day)}
            </text>
          )}
        </g>
      ))}
      <path d={line} fill="none" stroke="#C6FF3D" strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={d.day} cx={x(i)} cy={yE(d.escalations)} r="3" fill="#0B0F1E" stroke="#C6FF3D" strokeWidth="2" />
      ))}
    </svg>
  );
}

/** Area sparkline for a single series, e.g. p95 latency or daily cost. */
export function Sparkline({ values, color = "#9D8FFF", height = 56 }: { values: number[]; color?: string; height?: number }) {
  const W = 240;
  const H = height;
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values) * 1.1 || 1;
  const min = Math.min(...values) * 0.9;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const id = `spark-${color.slice(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,${H} L${pts.join(" L")} L${W},${H} Z`} fill={`url(#${id})`} />
      <path d={`M${pts.join(" L")}`} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Horizontal bars with labels, for tool usage. */
export function BarList({ items }: { items: { label: string; value: number; display?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-fog-100">{item.label}</span>
            <span className="font-mono tabular-nums text-fog-300">{item.display ?? item.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-dim to-violet" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One stacked bar showing shares, e.g. language mix. */
export function ShareBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
        {items.map((i) => (
          <div key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} title={`${i.label}: ${i.value}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-fog-100">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
              {i.label}
            </span>
            <span className="font-mono tabular-nums text-fog-300">{Math.round((i.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

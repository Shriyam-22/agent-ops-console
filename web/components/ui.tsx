import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/format";

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-ink-900/80 p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-fog-500">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const TONES = {
  lime: "text-lime border-lime/30 bg-lime/10",
  violet: "text-violet border-violet/30 bg-violet/10",
  coral: "text-coral border-coral/30 bg-coral/10",
  amber: "text-amber border-amber/30 bg-amber/10",
  danger: "text-danger border-danger/30 bg-danger/10",
  muted: "text-fog-300 border-white/10 bg-white/[0.04]",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const PRIORITY_TONE: Record<string, Tone> = { urgent: "danger", high: "coral", medium: "amber", low: "muted" };
const PRIORITY_DOT: Record<string, string> = { urgent: "bg-danger", high: "bg-coral", medium: "bg-amber", low: "bg-fog-500" };

export function Priority({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs capitalize text-fog-300">
      <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[value] ?? "bg-fog-500"} ${value === "urgent" ? "animate-pulse" : ""}`} />
      {value}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = { open: "violet", in_progress: "amber", resolved: "lime" };

export function StatusPill({ value }: { value: string }) {
  return <Badge tone={STATUS_TONE[value] ?? "muted"}>{STATUS_LABEL[value] ?? value}</Badge>;
}

export function Kpi({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: ReactNode; tone?: "default" | "good" | "warn" }) {
  const color = tone === "good" ? "text-lime" : tone === "warn" ? "text-coral" : "text-white";
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-ink-900/80 p-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog-500">{label}</div>
      <div className={`mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-fog-500">{sub}</div>}
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/10 p-6">
      <div className="font-mono text-xs uppercase tracking-widest text-danger">API unavailable</div>
      <p className="mt-2 text-sm text-fog-100">{message}</p>
      <p className="mt-1 text-sm text-fog-300">
        Start everything with <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono">docker compose up</code>.
      </p>
    </div>
  );
}

import Link from "next/link";
import { BarList, ShareBar, Sparkline, TrafficChart } from "@/components/charts";
import { Card, ErrorPanel, Kpi, Priority } from "@/components/ui";
import { api, ApiError, type Summary } from "@/lib/api";
import { LANGUAGE_LABEL, TOOL_LABEL, compact, ms, pct, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 14] as const;
const LANG_COLOR: Record<string, string> = { en: "#9D8FFF", hinglish: "#C6FF3D", hi: "#FF8A65" };
const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: raw } = await searchParams;
  const days = WINDOWS.includes(Number(raw) as 7 | 14) ? Number(raw) : 7;

  let s: Summary;
  try {
    s = await api.summary(days);
  } catch (err) {
    return <ErrorPanel message={err instanceof ApiError ? err.message : "Unknown error"} />;
  }
  const t = s.totals;

  const openBy = (p: string) => s.queue.filter((q) => q.priority === p).reduce((n, q) => n + q.count, 0);
  const queueTotal = s.queue.reduce((n, q) => n + q.count, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-lime">❯ overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">How the agent is doing</h1>
          <p className="mt-1 text-sm text-fog-300">
            {compact(t.sessions)} WhatsApp conversations in the last {days} days, {pct(1 - t.escalation_rate)} handled without a human.
          </p>
        </div>
        <div className="flex rounded-xl border border-white/10 p-1">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/?days=${w}`}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs ${w === days ? "bg-white/10 text-white" : "text-fog-500 hover:text-fog-100"}`}
            >
              {w}d
            </Link>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Conversations" value={compact(t.sessions)} sub={`${compact(t.turns)} agent turns`} />
        <Kpi label="Escalation rate" value={pct(t.escalation_rate)} sub={`${t.escalations} handed to humans`} tone={t.escalation_rate <= 0.1 ? "good" : "warn"} />
        <Kpi label="p95 latency" value={ms(t.p95_latency_ms)} sub={`p50 ${ms(t.p50_latency_ms)}`} tone={t.p95_latency_ms <= 4000 ? "default" : "warn"} />
        <Kpi label="LLM cost" value={usd(t.cost_usd)} sub={`${usd(t.cost_per_turn_usd)} per turn`} />
        <Kpi label="Guardrail repairs" value={pct(t.repair_rate)} sub={`${pct(t.fallback_rate)} fell back`} />
        <Kpi
          label="First response"
          value={t.median_first_response_min === null ? "—" : `${Math.round(t.median_first_response_min)}m`}
          sub="median, human team"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title="Traffic"
          className="xl:col-span-2"
          action={
            <div className="flex gap-4 font-mono text-[11px] text-fog-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-violet" />turns</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lime" />escalations</span>
            </div>
          }
        >
          <TrafficChart data={s.daily} />
        </Card>

        <Card title="Human queue" action={<Link href="/tickets?status=open" className="font-mono text-[11px] text-violet hover:text-white">view all →</Link>}>
          <div className="text-4xl font-semibold tabular-nums text-white">{queueTotal}</div>
          <p className="text-sm text-fog-500">open or in progress</p>
          <ul className="mt-5 space-y-3">
            {PRIORITIES.map((p) => (
              <li key={p} className="flex items-center justify-between">
                <Link href={`/tickets?priority=${p}`} className="hover:opacity-80">
                  <Priority value={p} />
                </Link>
                <span className="font-mono tabular-nums text-fog-100">{openBy(p)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card title="p95 latency / day">
          <div className="mb-2 text-xl font-semibold tabular-nums text-white">{ms(t.p95_latency_ms)}</div>
          <Sparkline values={s.daily.map((d) => d.p95_latency_ms)} color="#9D8FFF" />
        </Card>
        <Card title="Cost / day">
          <div className="mb-2 text-xl font-semibold tabular-nums text-white">{usd(t.cost_usd / Math.max(1, s.daily.length))}</div>
          <Sparkline values={s.daily.map((d) => d.cost_usd)} color="#C6FF3D" />
        </Card>
        <Card title="Language">
          <ShareBar items={s.languages.map((l) => ({ label: LANGUAGE_LABEL[l.language] ?? l.language, value: l.turns, color: LANG_COLOR[l.language] ?? "#6B7194" }))} />
        </Card>
        <Card title="Tool calls">
          <BarList items={s.tools.map((x) => ({ label: TOOL_LABEL[x.tool] ?? x.tool, value: x.calls, display: compact(x.calls) }))} />
        </Card>
      </div>

      <p className="font-mono text-[11px] text-fog-700">
        {compact(t.tokens)} tokens · metrics cached in Redis, refreshed on new data
      </p>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Badge, Card, ErrorPanel, PRIORITY_TONE, StatusPill } from "@/components/ui";
import { api, ApiError, type Message, type Trace } from "@/lib/api";
import { LANGUAGE_LABEL, TOOL_LABEL, istDate, istTime, minutes, ms, usd } from "@/lib/format";
import { ReplyBox, TicketControls } from "./forms";

export const dynamic = "force-dynamic";

const BUBBLE: Record<Message["role"], string> = {
  customer: "mr-auto rounded-bl-md bg-ink-800 text-fog-100",
  agent: "ml-auto rounded-br-md border border-violet/25 bg-violet/10 text-fog-100",
  human: "ml-auto rounded-br-md border border-lime/25 bg-lime/10 text-fog-100",
  note: "mx-auto w-full rounded-md border border-dashed border-amber/40 bg-amber/[0.06] text-amber",
};
const WHO: Record<Message["role"], string> = { customer: "", agent: "AI agent", human: "Team", note: "Internal note" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data;
  try {
    data = await api.ticket(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return <ErrorPanel message={err instanceof ApiError ? err.message : "Unknown error"} />;
  }
  const { ticket: t, messages, traces } = data;
  const totalCost = traces.reduce((s, x) => s + x.cost_usd, 0);
  const maxLatency = Math.max(...traces.map((x) => x.latency_ms), 1);

  return (
    <div className="space-y-6">
      <Link href="/tickets" className="font-mono text-xs text-fog-500 hover:text-fog-100">
        ← all escalations
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={t.status} />
            <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
            <Badge>{t.category}</Badge>
            <Badge tone="violet">{LANGUAGE_LABEL[t.language] ?? t.language}</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">{t.reason}</h1>
          <p className="mt-1 font-mono text-xs text-fog-500">
            #{t.id} · {t.customer_name}
            {t.phone_last4 && ` · ••••${t.phone_last4}`}
            {t.order_id && ` · order ${t.order_id}`} · escalated {istDate(t.created_at)} IST
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Conversation">
            <ol className="flex flex-col gap-3">
              {messages.map((m) => (
                <li key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 ${BUBBLE[m.role]}`}>
                  <div className="mb-1 flex items-center gap-2 font-mono text-[10.5px] text-fog-500">
                    <span className="text-fog-300">{m.author ?? WHO[m.role]}</span>
                    {WHO[m.role] && m.role !== "note" && <span>· {WHO[m.role]}</span>}
                    {m.role === "note" && <span>· internal</span>}
                    <span className="ml-auto">{istTime(m.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              <ReplyBox ticketId={t.id} defaultAuthor={t.assignee} />
            </div>
          </Card>

          <Card
            title="Agent trace"
            action={<span className="font-mono text-[11px] text-fog-500">{traces.length} turns · {usd(totalCost)}</span>}
          >
            {traces.length === 0 ? (
              <p className="text-sm text-fog-500">No traces recorded for this session.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-white/10 pl-5">
                {traces.map((x, i) => (
                  <TraceRow key={x.id} trace={x} index={i + 1} maxLatency={maxLatency} />
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Manage">
            <TicketControls key={`${t.status}-${t.priority}-${t.assignee ?? ""}`} ticket={t} />
          </Card>
          <Card title="Timeline">
            <dl className="space-y-3 text-sm">
              <Row label="Escalated" value={istDate(t.created_at)} />
              <Row label="First response" value={minutes(t.created_at, t.first_response_at)} />
              <Row label="Resolved after" value={minutes(t.created_at, t.resolved_at)} />
              <Row label="Session" value={<span className="font-mono text-xs">{t.session_id}</span>} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fog-500">{label}</dt>
      <dd className="text-right text-fog-100">{value}</dd>
    </div>
  );
}

function TraceRow({ trace: x, index, maxLatency }: { trace: Trace; index: number; maxLatency: number }) {
  const slow = x.latency_ms > 4000;
  return (
    <li className="relative">
      <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-ink-900 ${x.fallback ? "bg-danger" : x.repaired ? "bg-amber" : "bg-violet"}`} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-fog-300">turn {index}</span>
        <span className="font-mono text-[11px] text-fog-500">{istTime(x.created_at)}</span>
        {x.tools.map((tool) => (
          <Badge key={tool} tone={tool === "escalate_to_human" ? "lime" : "violet"}>
            {TOOL_LABEL[tool] ?? tool}
          </Badge>
        ))}
        {x.repaired && <Badge tone="amber">{x.fallback ? "repair failed → fallback" : "grounding repaired"}</Badge>}
        {x.flags.filter((f) => f !== "price_grounding").map((f) => (
          <Badge key={f} tone="danger">{f.replace(/_/g, " ")}</Badge>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
          <div className={`h-1.5 rounded-full ${slow ? "bg-coral" : "bg-violet"}`} style={{ width: `${(x.latency_ms / maxLatency) * 100}%` }} />
        </div>
        <span className="w-14 text-right font-mono text-xs tabular-nums text-fog-300">{ms(x.latency_ms)}</span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-fog-500">
        {x.input_tokens.toLocaleString("en-IN")} in · {x.output_tokens.toLocaleString("en-IN")} out · {usd(x.cost_usd)}
      </div>
    </li>
  );
}

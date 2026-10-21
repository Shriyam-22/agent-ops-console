import Link from "next/link";
import { Badge, ErrorPanel, Priority, StatusPill } from "@/components/ui";
import { api, ApiError, type Ticket } from "@/lib/api";
import { LANGUAGE_LABEL, ago } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 20;
type Params = { status?: string; priority?: string; category?: string; q?: string; page?: string };

const FILTERS = {
  status: [["", "Any status"], ["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"]],
  priority: [["", "Any priority"], ["urgent", "Urgent"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]],
  category: [["", "Any category"], ["order", "Order"], ["damaged", "Damaged"], ["refund", "Refund"], ["product", "Product"], ["policy", "Policy"], ["other", "Other"]],
} as const;

export default async function Tickets({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  let data: { tickets: Ticket[]; total: number };
  try {
    data = await api.tickets({
      status: params.status,
      priority: params.priority,
      category: params.category,
      q: params.q,
      limit: String(PAGE),
      offset: String((page - 1) * PAGE),
    });
  } catch (err) {
    return <ErrorPanel message={err instanceof ApiError ? err.message : "Unknown error"} />;
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  const link = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/tickets${s ? `?${s}` : ""}`;
  };
  const now = Date.now();

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-xs text-lime">❯ escalations</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Handed to the team</h1>
        <p className="mt-1 text-sm text-fog-300">Conversations the agent escalated, most urgent first.</p>
      </header>

      <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]" action="/tickets">
        <input name="q" defaultValue={params.q} placeholder="Search customer, order ID or reason" className="field" />
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((key) => (
          <select key={key} name={key} defaultValue={params[key] ?? ""} className="field lg:w-40" aria-label={key}>
            {FILTERS[key].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ))}
        <button className="btn btn-primary">Filter</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/80">
        {data.tickets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-lg text-white">Nothing here</div>
            <p className="mt-1 text-sm text-fog-500">No escalations match these filters.</p>
            <Link href="/tickets" className="btn btn-ghost mt-4">Clear filters</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/[0.06] font-mono text-[10.5px] uppercase tracking-[0.12em] text-fog-500">
                <tr>
                  <th className="px-5 py-3 font-normal">Priority</th>
                  <th className="px-3 py-3 font-normal">Customer and reason</th>
                  <th className="px-3 py-3 font-normal">Category</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-3 py-3 font-normal">Assignee</th>
                  <th className="px-5 py-3 text-right font-normal">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.tickets.map((t) => (
                  <tr key={t.id} className="group relative transition-colors hover:bg-white/[0.03]">
                    <td className="px-5 py-4 align-top">
                      <Priority value={t.priority} />
                    </td>
                    <td className="max-w-[420px] px-3 py-4">
                      <Link href={`/tickets/${t.id}`} className="after:absolute after:inset-0">
                        <span className="font-medium text-white">{t.customer_name}</span>
                        <span className="ml-2 font-mono text-xs text-fog-500">
                          #{t.id}
                          {t.order_id && ` · ${t.order_id}`} · {LANGUAGE_LABEL[t.language] ?? t.language}
                        </span>
                        <span className="mt-1 block truncate text-fog-300">{t.reason}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-4 align-top"><Badge>{t.category}</Badge></td>
                    <td className="px-3 py-4 align-top"><StatusPill value={t.status} /></td>
                    <td className="px-3 py-4 align-top text-fog-300">{t.assignee ?? <span className="text-fog-700">Unassigned</span>}</td>
                    <td className="px-5 py-4 text-right align-top font-mono tabular-nums text-fog-300">{ago(t.created_at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.total > 0 && (
        <div className="flex items-center justify-between font-mono text-xs text-fog-500">
          <span>
            {data.total} escalation{data.total === 1 ? "" : "s"} · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && <Link href={link(page - 1)} className="btn btn-ghost px-3 py-1.5">← Prev</Link>}
            {page < pages && <Link href={link(page + 1)} className="btn btn-ghost px-3 py-1.5">Next →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

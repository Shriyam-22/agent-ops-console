import type { Database, Queryable } from "./db";
import {
  defaultPriority,
  type EscalationInput,
  type MessageInput,
  type TicketQuery,
  type TicketUpdate,
  type TraceInput,
} from "./validation";

export interface Ticket {
  id: number;
  session_id: string;
  customer_name: string;
  phone_last4: string | null;
  order_id: string | null;
  reason: string;
  category: string;
  priority: string;
  status: string;
  language: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  message_count?: number;
}

export interface Message {
  id: number;
  ticket_id: number;
  role: string;
  author: string | null;
  body: string;
  created_at: string;
}

export interface Trace {
  id: number;
  session_id: string;
  language: string;
  tools: string[];
  flags: string[];
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  repaired: boolean;
  fallback: boolean;
  created_at: string;
}

const TICKET_COLUMNS = `t.id, t.session_id, t.customer_name, t.phone_last4, t.order_id, t.reason, t.category,
  t.priority, t.status, t.language, t.assignee, t.created_at, t.updated_at, t.first_response_at, t.resolved_at`;

const PRIORITY_RANK = `CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;

// ---------- tickets ----------

export async function createEscalation(db: Database, input: EscalationInput): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<Ticket>(
      `INSERT INTO tickets (session_id, customer_name, phone_last4, order_id, reason, category, priority, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.session_id,
        input.customer_name,
        input.phone_last4 ?? null,
        input.order_id ?? null,
        input.reason,
        input.category,
        input.priority ?? defaultPriority(input.category),
        input.language,
      ],
    );
    const ticket = rows[0];
    for (const m of input.transcript) {
      await tx.query(
        `INSERT INTO messages (ticket_id, role, author, body, created_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))`,
        [ticket.id, m.role, m.role === "agent" ? "Neha (AI)" : input.customer_name, m.body, m.at ?? null],
      );
    }
    return ticket;
  });
}

export async function listTickets(
  db: Queryable,
  q: TicketQuery,
): Promise<{ tickets: Ticket[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (q.status) add("t.status = ?", q.status);
  if (q.priority) add("t.priority = ?", q.priority);
  if (q.category) add("t.category = ?", q.category);
  if (q.q) {
    params.push(`%${q.q}%`);
    const p = `$${params.length}`;
    where.push(`(t.customer_name ILIKE ${p} OR t.order_id ILIKE ${p} OR t.reason ILIKE ${p})`);
  }

  params.push(q.limit, q.offset);
  const { rows } = await db.query<Ticket & { total: number }>(
    `SELECT ${TICKET_COLUMNS},
            (SELECT count(*)::int FROM messages m WHERE m.ticket_id = t.id) AS message_count,
            count(*) OVER ()::int AS total
       FROM tickets t
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY (t.status = 'resolved'), ${PRIORITY_RANK}, t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const total = rows[0]?.total ?? 0;
  return { tickets: rows.map(({ total: _total, ...t }) => t), total };
}

export async function getTicket(
  db: Queryable,
  id: number,
): Promise<{ ticket: Ticket; messages: Message[]; traces: Trace[] } | null> {
  const { rows } = await db.query<Ticket>(`SELECT ${TICKET_COLUMNS} FROM tickets t WHERE t.id = $1`, [id]);
  const ticket = rows[0];
  if (!ticket) return null;

  const [messages, traces] = await Promise.all([
    db.query<Message>(`SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at, id`, [id]),
    db.query<Trace>(
      `SELECT id, session_id, language, tools, flags, latency_ms, input_tokens, output_tokens,
              cost_usd::float AS cost_usd, repaired, fallback, created_at
         FROM traces WHERE session_id = $1 ORDER BY created_at, id`,
      [ticket.session_id],
    ),
  ]);
  return { ticket, messages: messages.rows, traces: traces.rows };
}

export async function updateTicket(db: Queryable, id: number, patch: TicketUpdate): Promise<Ticket | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.status !== undefined) {
    set("status", patch.status);
    sets.push(patch.status === "resolved" ? "resolved_at = COALESCE(resolved_at, now())" : "resolved_at = NULL");
  }
  if (patch.priority !== undefined) set("priority", patch.priority);
  if (patch.assignee !== undefined) set("assignee", patch.assignee || null);
  sets.push("updated_at = now()");

  params.push(id);
  const { rows } = await db.query<Ticket>(
    `UPDATE tickets SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function addMessage(db: Database, ticketId: number, input: MessageInput): Promise<Message | null> {
  return db.transaction(async (tx) => {
    const exists = await tx.query(`SELECT 1 FROM tickets WHERE id = $1 FOR UPDATE`, [ticketId]);
    if (!exists.rowCount) return null;

    const { rows } = await tx.query<Message>(
      `INSERT INTO messages (ticket_id, role, author, body) VALUES ($1, $2, $3, $4) RETURNING *`,
      [ticketId, input.role, input.author, input.body],
    );
    // A reply to the customer (not an internal note) counts as the first response
    // and moves an open ticket to in progress.
    await tx.query(
      input.role === "human"
        ? `UPDATE tickets SET updated_at = now(),
                 first_response_at = COALESCE(first_response_at, now()),
                 status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
            WHERE id = $1`
        : `UPDATE tickets SET updated_at = now() WHERE id = $1`,
      [ticketId],
    );
    return rows[0];
  });
}

// ---------- traces ----------

export async function insertTrace(db: Queryable, t: TraceInput): Promise<{ id: number }> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO traces (session_id, language, tools, flags, latency_ms, input_tokens, output_tokens,
                         cost_usd, repaired, fallback, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, now()))
     RETURNING id`,
    [
      t.session_id,
      t.language,
      t.tools,
      t.flags,
      t.latency_ms,
      t.input_tokens,
      t.output_tokens,
      t.cost_usd,
      t.repaired,
      t.fallback,
      t.at ?? null,
    ],
  );
  return rows[0];
}

// ---------- metrics ----------

export interface Summary {
  days: number;
  totals: {
    turns: number;
    sessions: number;
    escalations: number;
    escalation_rate: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    cost_usd: number;
    cost_per_turn_usd: number;
    tokens: number;
    repair_rate: number;
    fallback_rate: number;
    median_first_response_min: number | null;
  };
  daily: { day: string; turns: number; escalations: number; cost_usd: number; p95_latency_ms: number }[];
  languages: { language: string; turns: number }[];
  tools: { tool: string; calls: number }[];
  queue: { status: string; priority: string; count: number }[];
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 10000 : 0);
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

export async function getSummary(db: Queryable, days: number): Promise<Summary> {
  const since = `now() - make_interval(days => $1::int)`;

  const [agg, esc, daily, languages, tools, queue] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS turns,
              count(DISTINCT session_id)::int AS sessions,
              COALESCE(percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms), 0)::float AS p50,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::float AS p95,
              COALESCE(sum(cost_usd), 0)::float AS cost,
              COALESCE(sum(input_tokens + output_tokens), 0)::float AS tokens,
              count(*) FILTER (WHERE repaired)::int AS repaired,
              count(*) FILTER (WHERE fallback)::int AS fallbacks
         FROM traces WHERE created_at >= ${since}`,
      [days],
    ),
    db.query(
      `SELECT count(*)::int AS escalations,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY extract(epoch FROM first_response_at - created_at) / 60
              )::float AS median_first_response_min
         FROM tickets WHERE created_at >= ${since}`,
      [days],
    ),
    db.query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              count(t.id)::int AS turns,
              (SELECT count(*)::int FROM tickets k
                WHERE k.created_at >= d.day AND k.created_at < d.day + interval '1 day') AS escalations,
              COALESCE(sum(t.cost_usd), 0)::float AS cost_usd,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY t.latency_ms), 0)::float AS p95_latency_ms
         FROM generate_series(date_trunc('day', now()) - make_interval(days => $1::int - 1),
                              date_trunc('day', now()), interval '1 day') AS d(day)
         LEFT JOIN traces t ON t.created_at >= d.day AND t.created_at < d.day + interval '1 day'
        GROUP BY d.day
        ORDER BY d.day`,
      [days],
    ),
    db.query(
      `SELECT language, count(*)::int AS turns FROM traces
        WHERE created_at >= ${since} GROUP BY language ORDER BY turns DESC`,
      [days],
    ),
    db.query(
      `SELECT tool, count(*)::int AS calls FROM traces, unnest(tools) AS tool
        WHERE created_at >= ${since} GROUP BY tool ORDER BY calls DESC, tool`,
      [days],
    ),
    db.query(
      `SELECT status, priority, count(*)::int AS count FROM tickets
        WHERE status <> 'resolved' GROUP BY status, priority`,
    ),
  ]);

  const a = agg.rows[0];
  const e = esc.rows[0];
  return {
    days,
    totals: {
      turns: a.turns,
      sessions: a.sessions,
      escalations: e.escalations,
      escalation_rate: ratio(e.escalations, a.sessions),
      p50_latency_ms: Math.round(a.p50),
      p95_latency_ms: Math.round(a.p95),
      cost_usd: round(a.cost, 4),
      cost_per_turn_usd: round(a.turns ? a.cost / a.turns : 0, 6),
      tokens: a.tokens,
      repair_rate: ratio(a.repaired, a.turns),
      fallback_rate: ratio(a.fallbacks, a.turns),
      median_first_response_min:
        e.median_first_response_min === null ? null : round(e.median_first_response_min, 1),
    },
    daily: daily.rows.map((d: any) => ({
      ...d,
      cost_usd: round(d.cost_usd, 4),
      p95_latency_ms: Math.round(d.p95_latency_ms),
    })),
    languages: languages.rows,
    tools: tools.rows,
    queue: queue.rows,
  };
}

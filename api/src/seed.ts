import { loadConfig } from "./config";
import { createDatabase, migrate, type Queryable } from "./db";
import { generateSeed } from "./seedData";

/** Insert rows in chunks with one multi-row INSERT per chunk. */
async function insertMany(db: Queryable, table: string, columns: string[], rows: unknown[][], casts: string[] = []) {
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = slice.map((row) => {
      const ph = row.map((v, j) => {
        params.push(v);
        return `$${params.length}${casts[j] ?? ""}`;
      });
      return `(${ph.join(", ")})`;
    });
    await db.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values.join(", ")}`, params);
  }
}

export async function seed(db: ReturnType<typeof createDatabase>, now = new Date()) {
  const { traces, tickets } = generateSeed(now);

  await db.transaction(async (tx) => {
    await tx.query("TRUNCATE messages, tickets, traces RESTART IDENTITY");

    await insertMany(
      tx,
      "traces",
      ["session_id", "language", "tools", "flags", "latency_ms", "input_tokens", "output_tokens", "cost_usd", "repaired", "fallback", "created_at"],
      traces.map((t) => [t.session_id, t.language, t.tools, t.flags, t.latency_ms, t.input_tokens, t.output_tokens, t.cost_usd, t.repaired, t.fallback, t.at]),
      ["", "", "::text[]", "::text[]"],
    );

    for (const t of tickets) {
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO tickets (session_id, customer_name, phone_last4, order_id, reason, category, priority, status,
                              language, assignee, created_at, updated_at, first_response_at, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($13::timestamptz, $12::timestamptz, $11::timestamptz), $12, $13)
         RETURNING id`,
        [t.session_id, t.customer_name, t.phone_last4, t.order_id, t.reason, t.category, t.priority, t.status,
         t.language, t.assignee, t.created_at, t.first_response_at, t.resolved_at],
      );
      await insertMany(
        tx,
        "messages",
        ["ticket_id", "role", "author", "body", "created_at"],
        t.messages.map((m) => [rows[0].id, m.role, m.author, m.body, m.at]),
      );
    }
  });

  return { traces: traces.length, tickets: tickets.length };
}

if (require.main === module) {
  (async () => {
    const db = createDatabase(loadConfig().databaseUrl);
    await migrate(db);
    const counts = await seed(db);
    console.log(`[seed] inserted ${counts.traces} traces and ${counts.tickets} tickets`);
    await db.close();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

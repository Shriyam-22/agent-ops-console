/**
 * API tests against a real Postgres. Set DATABASE_URL to a throwaway database
 * (CI starts one as a service). Skipped when DATABASE_URL is not set.
 */
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { memoryCache, type Cache } from "../src/cache";
import { createDatabase, migrate, type Database } from "../src/db";

const DATABASE_URL = process.env.DATABASE_URL;

const escalation = {
  session_id: "wa-test-1",
  customer_name: "Priya",
  phone_last4: "1234",
  order_id: "NN1004",
  reason: "Serum bottle arrived broken",
  category: "damaged",
  language: "hinglish",
  transcript: [
    { role: "customer", body: "Bottle toota hua aaya hai" },
    { role: "agent", body: "Sorry! Connecting you to our team." },
  ],
};

const trace = (over: Record<string, unknown> = {}) => ({
  session_id: "wa-test-1",
  language: "hinglish",
  tools: ["track_order"],
  latency_ms: 1500,
  input_tokens: 1200,
  output_tokens: 90,
  cost_usd: 0.000234,
  ...over,
});

describe.skipIf(!DATABASE_URL)("API", () => {
  let db: Database;
  let cache: Cache;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    db = createDatabase(DATABASE_URL!);
    await migrate(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query("TRUNCATE messages, tickets, traces RESTART IDENTITY");
    cache = memoryCache();
    app = createApp({ db, cache, ingestApiKey: "test-key", cacheTtlSeconds: 30, ingestRateLimitPerMinute: 5, now: () => 0 });
  });

  const ingest = (path: string) => request(app).post(path).set("x-api-key", "test-key");

  it("reports health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true, cache: true });
  });

  it("creates a ticket with its transcript from an escalation", async () => {
    const res = await ingest("/api/escalations").send(escalation);
    expect(res.status).toBe(201);
    expect(res.body.ticket).toMatchObject({ id: 1, priority: "high", status: "open", category: "damaged" });

    const detail = await request(app).get("/api/tickets/1");
    expect(detail.status).toBe(200);
    expect(detail.body.messages.map((m: { role: string }) => m.role)).toEqual(["customer", "agent"]);
  });

  it("rejects ingest without the API key", async () => {
    const res = await request(app).post("/api/escalations").send(escalation);
    expect(res.status).toBe(401);
  });

  it("returns field errors for invalid input", async () => {
    const res = await ingest("/api/escalations").send({ ...escalation, category: "unknown", phone_last4: "12" });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.fields).sort()).toEqual(["category", "phone_last4"]);
  });

  it("rate-limits ingest per client", async () => {
    for (let i = 0; i < 5; i++) expect((await ingest("/api/traces").send(trace())).status).toBe(201);
    const blocked = await ingest("/api/traces").send(trace());
    expect(blocked.status).toBe(429);
  });

  it("filters and searches the queue", async () => {
    await ingest("/api/escalations").send(escalation);
    await ingest("/api/escalations").send({ ...escalation, session_id: "wa-2", customer_name: "Rahul", category: "policy", reason: "Address change", order_id: "NN2000" });

    const all = await request(app).get("/api/tickets");
    expect(all.body.total).toBe(2);
    expect(all.body.tickets[0].priority).toBe("high"); // high before low

    const search = await request(app).get("/api/tickets").query({ q: "rahul" });
    expect(search.body.tickets.map((t: { customer_name: string }) => t.customer_name)).toEqual(["Rahul"]);

    const byCategory = await request(app).get("/api/tickets").query({ category: "damaged" });
    expect(byCategory.body.total).toBe(1);

    const bad = await request(app).get("/api/tickets").query({ status: "nope" });
    expect(bad.status).toBe(422);
  });

  it("moves a ticket through its lifecycle", async () => {
    await ingest("/api/escalations").send(escalation);

    const reply = await request(app).post("/api/tickets/1/messages").send({ role: "human", author: "Aarti", body: "Replacement sent" });
    expect(reply.status).toBe(201);
    let t = (await request(app).get("/api/tickets/1")).body.ticket;
    expect(t.status).toBe("in_progress");
    expect(t.first_response_at).not.toBeNull();

    const resolved = await request(app).patch("/api/tickets/1").send({ status: "resolved", assignee: "Aarti" });
    expect(resolved.body.ticket).toMatchObject({ status: "resolved", assignee: "Aarti" });
    expect(resolved.body.ticket.resolved_at).not.toBeNull();

    const reopened = await request(app).patch("/api/tickets/1").send({ status: "open" });
    expect(reopened.body.ticket.resolved_at).toBeNull();
  });

  it("returns 404 for unknown tickets and routes", async () => {
    expect((await request(app).get("/api/tickets/999")).status).toBe(404);
    expect((await request(app).get("/api/tickets/abc")).status).toBe(404);
    expect((await request(app).patch("/api/tickets/999").send({ status: "resolved" })).status).toBe(404);
    expect((await request(app).post("/api/tickets/999/messages").send({ role: "note", author: "A", body: "x" })).status).toBe(404);
    expect((await request(app).get("/api/nope")).status).toBe(404);
  });

  it("computes metrics and caches them until new data arrives", async () => {
    await ingest("/api/traces").send(trace({ latency_ms: 1000 }));
    await ingest("/api/traces").send(trace({ latency_ms: 3000, tools: ["track_order", "escalate_to_human"], repaired: true }));
    await ingest("/api/escalations").send(escalation);

    const first = await request(app).get("/api/metrics/summary").query({ days: 7 });
    expect(first.status).toBe(200);
    expect(first.headers["x-cache"]).toBe("MISS");
    expect(first.body.totals).toMatchObject({ turns: 2, sessions: 1, escalations: 1, escalation_rate: 1, p50_latency_ms: 2000, repair_rate: 0.5 });
    expect(first.body.daily).toHaveLength(7);
    expect(first.body.tools[0]).toEqual({ tool: "track_order", calls: 2 });

    const second = await request(app).get("/api/metrics/summary").query({ days: 7 });
    expect(second.headers["x-cache"]).toBe("HIT");

    await ingest("/api/traces").send(trace());
    const third = await request(app).get("/api/metrics/summary").query({ days: 7 });
    expect(third.headers["x-cache"]).toBe("MISS");
    expect(third.body.totals.turns).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { cached, invalidateMetrics, memoryCache } from "../src/cache";
import { generateSeed } from "../src/seedData";
import { defaultPriority, escalationSchema, fieldErrors, traceSchema } from "../src/validation";

describe("validation", () => {
  it("defaults priority by category", () => {
    expect(defaultPriority("damaged")).toBe("high");
    expect(defaultPriority("refund")).toBe("medium");
    expect(defaultPriority("policy")).toBe("low");
  });

  it("reports field-level errors for a bad escalation", () => {
    const result = escalationSchema.safeParse({ session_id: "s1", phone_last4: "12a4", category: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = fieldErrors(result.error);
      expect(Object.keys(fields)).toEqual(expect.arrayContaining(["customer_name", "reason", "category", "phone_last4"]));
    }
  });

  it("fills trace defaults", () => {
    const t = traceSchema.parse({ session_id: "s1", latency_ms: 1200 });
    expect(t).toMatchObject({ language: "en", tools: [], cost_usd: 0, repaired: false });
  });

  it("rejects negative latency", () => {
    expect(traceSchema.safeParse({ session_id: "s1", latency_ms: -5 }).success).toBe(false);
  });
});

describe("cache", () => {
  it("expires entries after their TTL", async () => {
    let now = 0;
    const cache = memoryCache(() => now);
    await cache.set("k", "v", 10);
    expect(await cache.get("k")).toBe("v");
    now = 10_001;
    expect(await cache.get("k")).toBeNull();
  });

  it("counts within a window and resets after it", async () => {
    let now = 0;
    const cache = memoryCache(() => now);
    expect(await cache.incr("rl", 60)).toBe(1);
    expect(await cache.incr("rl", 60)).toBe(2);
    now = 60_001;
    expect(await cache.incr("rl", 60)).toBe(1);
  });

  it("serves a hit until a write invalidates it", async () => {
    const cache = memoryCache();
    let loads = 0;
    const load = async () => ({ n: ++loads });

    expect(await cached(cache, "m", 30, load)).toEqual({ value: { n: 1 }, hit: false });
    expect(await cached(cache, "m", 30, load)).toEqual({ value: { n: 1 }, hit: true });
    await invalidateMetrics(cache);
    expect(await cached(cache, "m", 30, load)).toEqual({ value: { n: 2 }, hit: false });
  });

  it("falls back to the loader when the cache is down", async () => {
    const broken = { ...memoryCache(), get: async () => { throw new Error("down"); } };
    expect(await cached(broken, "m", 30, async () => 7)).toEqual({ value: 7, hit: false });
  });
});

describe("seed data", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const { traces, tickets } = generateSeed(now);

  it("is deterministic", () => {
    expect(generateSeed(now)).toEqual({ traces, tickets });
  });

  it("never produces events in the future", () => {
    for (const t of traces) expect(Date.parse(t.at)).toBeLessThanOrEqual(now.getTime());
    for (const t of tickets) expect(Date.parse(t.created_at)).toBeLessThanOrEqual(now.getTime());
  });

  it("keeps a live queue and consistent ticket timestamps", () => {
    expect(tickets.filter((t) => t.status === "open")).toHaveLength(5);
    for (const t of tickets) {
      if (t.status === "open") expect(t.first_response_at).toBeNull();
      if (t.status === "resolved") expect(t.resolved_at).not.toBeNull();
      if (t.first_response_at) expect(t.first_response_at >= t.created_at).toBe(true);
    }
  });

  it("logs an escalate_to_human call for every ticket", () => {
    const escalated = new Set(traces.filter((t) => t.tools.includes("escalate_to_human")).map((t) => t.session_id));
    for (const t of tickets) expect(escalated.has(t.session_id)).toBe(true);
  });
});

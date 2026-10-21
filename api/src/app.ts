import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { ZodError } from "zod";
import { cached, invalidateMetrics, type Cache } from "./cache";
import type { Database } from "./db";
import * as repo from "./repo";
import {
  escalationSchema,
  fieldErrors,
  messageSchema,
  metricsQuerySchema,
  ticketQuerySchema,
  ticketUpdateSchema,
  traceSchema,
} from "./validation";

export interface AppDeps {
  db: Database;
  cache: Cache;
  ingestApiKey?: string | null;
  cacheTtlSeconds?: number;
  ingestRateLimitPerMinute?: number;
  /** Clock for the rate-limit window; injectable for tests. */
  now?: () => number;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Express 4 does not catch rejected promises; this forwards them to the error handler. */
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, "Ticket not found");
  return id;
}

export function createApp(deps: AppDeps) {
  const { db, cache } = deps;
  const ttl = deps.cacheTtlSeconds ?? 30;
  const rateLimit = deps.ingestRateLimitPerMinute ?? 120;
  const now = deps.now ?? Date.now;

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));

  // ----- ingest guard: API key + per-client rate limit backed by Redis -----
  const checkIngest = async (req: Request, res: Response) => {
    if (deps.ingestApiKey && req.get("x-api-key") !== deps.ingestApiKey) {
      throw new HttpError(401, "Missing or invalid x-api-key");
    }
    const windowKey = `rl:${req.ip}:${Math.floor(now() / 60_000)}`;
    let count = 0;
    try {
      count = await cache.incr(windowKey, 60);
    } catch {
      // Fail open: losing rate limiting is better than dropping the agent's data.
    }
    res.setHeader("X-RateLimit-Limit", String(rateLimit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, rateLimit - count)));
    if (count > rateLimit) throw new HttpError(429, "Rate limit exceeded, retry in a minute");
  };
  const ingestGuard: RequestHandler = (req, res, next) => {
    checkIngest(req, res).then(() => next(), next);
  };

  // ----- health -----
  app.get(
    "/api/health",
    route(async (_req, res) => {
      const [dbOk, cacheOk] = await Promise.all([
        db.query("SELECT 1").then(
          () => true,
          () => false,
        ),
        cache.ping(),
      ]);
      res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk, cache: cacheOk });
    }),
  );

  // ----- ingest from the support agent -----
  app.post(
    "/api/escalations",
    ingestGuard,
    route(async (req, res) => {
      const ticket = await repo.createEscalation(db, escalationSchema.parse(req.body));
      await invalidateMetrics(cache);
      res.status(201).json({ ticket });
    }),
  );

  app.post(
    "/api/traces",
    ingestGuard,
    route(async (req, res) => {
      const { id } = await repo.insertTrace(db, traceSchema.parse(req.body));
      await invalidateMetrics(cache);
      res.status(201).json({ id });
    }),
  );

  // ----- tickets -----
  app.get(
    "/api/tickets",
    route(async (req, res) => {
      res.json(await repo.listTickets(db, ticketQuerySchema.parse(req.query)));
    }),
  );

  app.get(
    "/api/tickets/:id",
    route(async (req, res) => {
      const found = await repo.getTicket(db, parseId(req.params.id));
      if (!found) throw new HttpError(404, "Ticket not found");
      res.json(found);
    }),
  );

  app.patch(
    "/api/tickets/:id",
    route(async (req, res) => {
      const ticket = await repo.updateTicket(db, parseId(req.params.id), ticketUpdateSchema.parse(req.body));
      if (!ticket) throw new HttpError(404, "Ticket not found");
      await invalidateMetrics(cache);
      res.json({ ticket });
    }),
  );

  app.post(
    "/api/tickets/:id/messages",
    route(async (req, res) => {
      const message = await repo.addMessage(db, parseId(req.params.id), messageSchema.parse(req.body));
      if (!message) throw new HttpError(404, "Ticket not found");
      await invalidateMetrics(cache);
      res.status(201).json({ message });
    }),
  );

  // ----- metrics (cached in Redis) -----
  app.get(
    "/api/metrics/summary",
    route(async (req, res) => {
      const { days } = metricsQuerySchema.parse(req.query);
      const { value, hit } = await cached(cache, `metrics:summary:${days}`, ttl, () =>
        repo.getSummary(db, days),
      );
      res.setHeader("X-Cache", hit ? "HIT" : "MISS");
      res.json(value);
    }),
  );

  // ----- errors -----
  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(422).json({ error: "Invalid input", fields: fieldErrors(err) });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Malformed JSON" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

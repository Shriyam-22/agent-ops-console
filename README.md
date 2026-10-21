# Agent Ops Console

The human side of an AI support agent. When [`d2c-support-agent`](https://github.com/Shriyam-22/d2c-support-agent) can't solve a customer's problem on WhatsApp, it hands the conversation here: the support team sees the full transcript, the agent's trace for every turn, and works the ticket to resolution. A live dashboard shows how the agent is doing: escalation rate, latency, LLM cost, guardrail repairs and how fast humans respond.

The store, **Neem & Nest**, is fictional. The console ships with two weeks of realistic seeded traffic, so it looks alive the first time you run it.

```
docker compose up --build
```

Then open **http://localhost:3000**.

## What it does

| Screen | What you can do |
|---|---|
| **Overview** | Conversations, escalation rate, p50/p95 latency, LLM cost per turn, guardrail repair rate, median first response; traffic by day, latency and cost trends, language mix (English / Hindi / Hinglish), tool usage, the open queue by priority. 7 or 14 day window. |
| **Escalations** | The queue, urgent first. Search by customer, order ID or reason; filter by status, priority and category; paginated. |
| **Ticket** | The WhatsApp transcript (customer, AI agent, team, internal notes), a timeline of every agent turn with tools called, latency, tokens, cost and guardrail flags. Reply to the customer, add internal notes, change status, priority and assignee. |

## Architecture

```mermaid
flowchart LR
    A[d2c-support-agent<br/>WhatsApp bot] -- "POST /api/traces<br/>every turn" --> API
    A -- "POST /api/escalations<br/>hand-off" --> API
    subgraph Docker Compose
      WEB[Next.js 15<br/>React · TypeScript · Tailwind] -- "server-side fetch<br/>+ server actions" --> API[Express API<br/>TypeScript · Zod]
      API --> PG[(PostgreSQL<br/>tickets · messages · traces)]
      API --> RD[(Redis<br/>metrics cache · rate limits)]
    end
    U[Support team] --> WEB
```

- **Web** (`web/`): Next.js App Router. Pages are server components that call the API on the server, so the API is never exposed to the browser. Ticket updates and replies are server actions. Charts are hand-built SVG, rendered on the server, no chart library.
- **API** (`api/`): Express + TypeScript. Every input is validated with Zod and bad input gets a `422` with per-field errors. SQL is plain parameterised `pg` queries, no ORM.
- **PostgreSQL**: tickets, messages and traces. Metrics (percentiles, daily series) are computed in SQL with `percentile_cont` and `generate_series`.
- **Redis**: caches the metrics summary and rate-limits the ingest endpoints.

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/traces` | One agent turn: language, tools, latency, tokens, cost, guardrail flags. Needs `x-api-key`. |
| `POST` | `/api/escalations` | Hand-off with reason, category and transcript. Creates a ticket. Needs `x-api-key`. |
| `GET` | `/api/tickets?status=&priority=&category=&q=&limit=&offset=` | Queue, urgent first, with total count |
| `GET` | `/api/tickets/:id` | Ticket, messages and the session's traces |
| `PATCH` | `/api/tickets/:id` | Status, priority, assignee |
| `POST` | `/api/tickets/:id/messages` | Reply (`human`) or internal note (`note`) |
| `GET` | `/api/metrics/summary?days=7` | Dashboard numbers. `X-Cache: HIT/MISS` header |
| `GET` | `/api/health` | Postgres and Redis status |

### Sending data from the agent

```python
import requests

OPS = "http://localhost:4000"
HEADERS = {"x-api-key": "dev-ingest-key"}

# after every turn
requests.post(f"{OPS}/api/traces", headers=HEADERS, json={
    "session_id": session_id, "language": trace.language, "tools": trace.tools_called,
    "latency_ms": round(trace.total_latency_ms), "input_tokens": trace.input_tokens,
    "output_tokens": trace.output_tokens, "cost_usd": trace.cost_usd,
    "repaired": "repaired" in result.flags, "fallback": "fallback" in result.flags,
})

# when escalate_to_human runs
requests.post(f"{OPS}/api/escalations", headers=HEADERS, json={
    "session_id": session_id, "customer_name": name, "phone_last4": last4,
    "order_id": order_id, "reason": reason, "category": "damaged",
    "language": trace.language, "transcript": messages,
})
```

Or simulate it: `node scripts/simulate.mjs --turns 50` posts live traffic and the dashboard updates.

## Design decisions

| Decision | Why |
|---|---|
| **Cache invalidation by version number** | Every write bumps `metrics:version` in Redis, and cache keys include it. No key scanning, no stale dashboard after new data arrives, and old entries expire on their own. |
| **Redis failures don't take the API down** | The cache and the rate limiter fail open: if Redis is unavailable, metrics are served straight from Postgres and ingest is never dropped. Losing a rate limit is better than losing the agent's data. |
| **Ingest is authenticated and rate-limited; the console is not** | The agent posts from the internet; the console sits behind the company's SSO in production. Auth for staff is the first thing to add. |
| **Metrics in SQL, not in Node** | Postgres computes p50/p95 and the daily series in one round trip each. Moving thousands of rows into JavaScript to sort them would be slower and more code. |
| **Server components and server actions** | No client-side data fetching, no API keys or URLs in the browser, and the pages work before JavaScript loads. The only client components are the nav and the two forms. |
| **First response is set by the first reply to the customer** | Internal notes don't count. A reply also moves an open ticket to in progress, so the queue reflects reality without an extra click. |
| **Phone stored as the last 4 digits only** | Enough for staff to confirm identity with the customer; the full number never leaves the agent. |
| **Seed data is deterministic and relative to now** | Seeded from a fixed random seed and anchored to the current time, so every fresh install shows the same realistic two weeks with a live queue. |

## Tests and CI

```bash
cd api
npm install
npm test                     # unit tests; API tests run too when DATABASE_URL is set
DATABASE_URL=postgres://ops:ops@localhost:5432/agent_ops npm test
```

- **Unit:** validation rules, cache TTL and versioned invalidation, rate-limit windows, seed data invariants (deterministic, nothing in the future, every ticket has a matching `escalate_to_human` trace).
- **API (against real Postgres):** auth, `422` field errors, rate limiting, search and filters, the full ticket lifecycle, `404`s, metrics values and cache `HIT`/`MISS` behaviour.
- **GitHub Actions:** type-checks and tests the API with a Postgres service, builds the Next.js app, then builds the whole Docker Compose stack and smoke-tests it.

## Run without Docker

```bash
# Postgres and Redis running locally
cd api && npm install && DATABASE_URL=postgres://... REDIS_URL=redis://localhost:6379 SEED_DEMO_DATA=true npm run dev
cd web && npm install && API_URL=http://localhost:4000 npm run dev
```

`docker compose down -v` wipes the database; the next `up` reseeds it with fresh dates.

## Deploying to AWS

The stack is container-only, so it maps directly onto AWS:

1. Push the `api` and `web` images to **ECR**.
2. Run both as **ECS Fargate** services behind an **Application Load Balancer** (`/api/*` to the API, everything else to the web app).
3. Use **RDS for PostgreSQL** and **ElastiCache for Redis**; pass their URLs as `DATABASE_URL` and `REDIS_URL`, and keep `INGEST_API_KEY` in **Secrets Manager**.
4. Set `SEED_DEMO_DATA` to `false`.

For a single small demo box, `docker compose up -d` on one **EC2** instance works too.

## Limitations and next steps

- No staff login yet: add SSO (e.g. NextAuth with Google Workspace) and record who changed what.
- Replies are stored but not sent to WhatsApp; next is calling the WhatsApp Cloud API from the reply action.
- Live updates: push new tickets to open dashboards with server-sent events.
- Schema changes are a single idempotent SQL file; a real migration tool comes with the first breaking change.

## Tech stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS · Node.js · Express · Zod · PostgreSQL · Redis · Docker Compose · Vitest · Supertest · GitHub Actions

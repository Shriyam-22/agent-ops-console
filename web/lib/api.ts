// Server-side client for the Express API. Only used in server components and
// server actions, so the API never needs to be exposed to the browser.

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type Status = "open" | "in_progress" | "resolved";
export type Priority = "low" | "medium" | "high" | "urgent";

export interface Ticket {
  id: number;
  session_id: string;
  customer_name: string;
  phone_last4: string | null;
  order_id: string | null;
  reason: string;
  category: string;
  priority: Priority;
  status: Status;
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
  role: "customer" | "agent" | "human" | "note";
  author: string | null;
  body: string;
  created_at: string;
}

export interface Trace {
  id: number;
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
  queue: { status: Status; priority: Priority; count: number }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, `Can't reach the API at ${API_URL}. Is it running?`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText, body.fields);
  return body as T;
}

export const api = {
  summary: (days: number) => call<Summary>(`/api/metrics/summary?days=${days}`),

  tickets: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return call<{ tickets: Ticket[]; total: number }>(`/api/tickets?${qs}`);
  },

  ticket: (id: string) => call<{ ticket: Ticket; messages: Message[]; traces: Trace[] }>(`/api/tickets/${encodeURIComponent(id)}`),

  updateTicket: (id: number, patch: Partial<Pick<Ticket, "status" | "priority" | "assignee">>) =>
    call<{ ticket: Ticket }>(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  addMessage: (id: number, msg: { role: "human" | "note"; author: string; body: string }) =>
    call<{ message: Message }>(`/api/tickets/${id}/messages`, { method: "POST", body: JSON.stringify(msg) }),
};

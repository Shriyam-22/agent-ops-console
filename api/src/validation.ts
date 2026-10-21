import { z } from "zod";

export const LANGUAGES = ["en", "hi", "hinglish"] as const;
export const CATEGORIES = ["order", "damaged", "refund", "product", "policy", "other"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const STATUSES = ["open", "in_progress", "resolved"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

const text = (max: number) => z.string().trim().min(1, "Required").max(max);

/** Sent by the support agent when it hands a conversation to a human. */
export const escalationSchema = z.object({
  session_id: text(100),
  customer_name: text(120),
  phone_last4: z
    .string()
    .regex(/^\d{4}$/, "Must be 4 digits")
    .optional(),
  order_id: text(40).optional(),
  reason: text(500),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).optional(),
  language: z.enum(LANGUAGES).default("en"),
  transcript: z
    .array(
      z.object({
        role: z.enum(["customer", "agent"]),
        body: text(4000),
        at: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .max(200)
    .default([]),
});

/** Sent by the support agent after every turn. */
export const traceSchema = z.object({
  session_id: text(100),
  language: z.enum(LANGUAGES).default("en"),
  tools: z.array(text(60)).max(20).default([]),
  flags: z.array(text(60)).max(20).default([]),
  latency_ms: z.number().int().min(0).max(600_000),
  input_tokens: z.number().int().min(0).default(0),
  output_tokens: z.number().int().min(0).default(0),
  cost_usd: z.number().min(0).max(100).default(0),
  repaired: z.boolean().default(false),
  fallback: z.boolean().default(false),
  at: z.string().datetime({ offset: true }).optional(),
});

export const ticketQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(CATEGORIES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ticketUpdateSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assignee: z.string().trim().max(80).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const messageSchema = z.object({
  role: z.enum(["human", "note"]),
  author: text(80),
  body: text(4000),
});

export const metricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export type EscalationInput = z.infer<typeof escalationSchema>;
export type TraceInput = z.infer<typeof traceSchema>;
export type TicketQuery = z.infer<typeof ticketQuerySchema>;
export type TicketUpdate = z.infer<typeof ticketUpdateSchema>;
export type MessageInput = z.infer<typeof messageSchema>;

/** Priority when the agent does not set one: damaged goods and refunds jump the queue. */
export function defaultPriority(category: Category): Priority {
  switch (category) {
    case "damaged":
      return "high";
    case "refund":
    case "order":
      return "medium";
    default:
      return "low";
  }
}

/** Turn a ZodError into { field: message } for a 422 response. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

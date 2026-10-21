export const TEAM = ["Aarti", "Rohan", "Kavya"] as const;

export const LANGUAGE_LABEL: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };
export const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
export const TOOL_LABEL: Record<string, string> = {
  track_order: "Track order",
  search_products: "Product search",
  search_policies: "Policy search",
  escalate_to_human: "Escalate",
};

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)}s` : `${Math.round(x)}ms`);

export const usd = (x: number) =>
  x === 0 ? "$0" : x < 0.01 ? `$${x.toFixed(5)}` : x < 1 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`;

export const compact = (x: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(x);

/** "4m", "3h", "2d" — how long ago, relative to `now`. */
export function ago(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function minutes(from: string, to: string | null): string {
  if (!to) return "—";
  const m = Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

/** Time of day in India, where the store's customers are. */
export const istTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });

export const istDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });

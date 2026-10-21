"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError, type Priority, type Status } from "@/lib/api";

export type ActionState = { error?: string; ok?: boolean };

const STATUSES: Status[] = ["open", "in_progress", "resolved"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export async function updateTicket(id: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const status = String(form.get("status") ?? "");
  const priority = String(form.get("priority") ?? "");
  const assignee = String(form.get("assignee") ?? "");

  if (!STATUSES.includes(status as Status) || !PRIORITIES.includes(priority as Priority)) {
    return { error: "Pick a valid status and priority." };
  }
  try {
    await api.updateTicket(id, { status: status as Status, priority: priority as Priority, assignee: assignee || null });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not save." };
  }
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
  return { ok: true };
}

export async function addMessage(id: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const role = form.get("role") === "note" ? "note" : "human";
  const author = String(form.get("author") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();

  if (!author) return { error: "Choose who is replying." };
  if (!body) return { error: "Write a message first." };
  try {
    await api.addMessage(id, { role, author, body });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not send." };
  }
  revalidatePath(`/tickets/${id}`);
  return { ok: true };
}

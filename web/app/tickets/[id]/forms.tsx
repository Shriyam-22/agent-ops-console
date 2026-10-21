"use client";

import { useActionState } from "react";
import type { Ticket } from "@/lib/api";
import { TEAM } from "@/lib/format";
import { addMessage, updateTicket, type ActionState } from "./actions";

const initial: ActionState = {};

export function TicketControls({ ticket }: { ticket: Ticket }) {
  const [state, action, pending] = useActionState(updateTicket.bind(null, ticket.id), initial);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-widest text-fog-500">Status</span>
        <select name="status" defaultValue={ticket.status} className="field">
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-widest text-fog-500">Priority</span>
        <select name="priority" defaultValue={ticket.priority} className="field">
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-widest text-fog-500">Assignee</span>
        <select name="assignee" defaultValue={ticket.assignee ?? ""} className="field">
          <option value="">Unassigned</option>
          {TEAM.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : "Save changes"}
      </button>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-lime">Saved</p>}
    </form>
  );
}

export function ReplyBox({ ticketId, defaultAuthor }: { ticketId: number; defaultAuthor: string | null }) {
  const [state, action, pending] = useActionState(addMessage.bind(null, ticketId), initial);
  // React resets the form after a successful action, which clears the textarea.
  return (
    <form action={action} className="rounded-2xl border border-white/[0.07] bg-ink-850 p-3">
      <textarea
        name="body"
        rows={3}
        placeholder="Reply to the customer on WhatsApp, or leave an internal note"
        className="w-full resize-none bg-transparent px-1 text-sm text-fog-100 outline-none placeholder:text-fog-500"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select name="role" defaultValue="human" className="field w-auto py-1.5" aria-label="Message type">
          <option value="human">Reply to customer</option>
          <option value="note">Internal note</option>
        </select>
        <select name="author" defaultValue={defaultAuthor ?? TEAM[0]} className="field w-auto py-1.5" aria-label="Sender">
          {TEAM.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        <button disabled={pending} className="btn btn-primary ml-auto">
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

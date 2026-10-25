import type { ChatMessage } from "../../shared/api.ts";

// A message sent from the panel, shown before the thread detail contains it.
export interface PendingMessage {
  id: string;
  text: string;
  images: number;
  sentAt: number;
}

// Give up after this delay: the server may have changed the text or dropped the message.
export const PENDING_MAX_MS = 30_000;

export function isSettled(p: PendingMessage, messages: ChatMessage[], now: number): boolean {
  if (now - p.sentAt >= PENDING_MAX_MS) return true;
  return messages.some((m) => m.role === "user" && m.text === p.text && Date.parse(m.createdAt) >= p.sentAt);
}

export function pendingLabel(images: number): string {
  return images ? `Sending… · ${images} image${images === 1 ? "" : "s"}` : "Sending…";
}

import type { RawProjection, RawSearchMatch } from "../../integrations/t3/schemas.ts";

const SNIPPET_MAX = 240;

// Cuts around the hit and marks each cut edge with an ellipsis.
function snippetAround(text: string, at: number, length: number): string {
  if (text.length <= SNIPPET_MAX) return text;
  const room = SNIPPET_MAX - 2;
  const start = Math.min(Math.max(0, at - Math.floor((room - length) / 2)), text.length - room);
  const end = start + room;
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** One match per thread: the user's message wins, else the latest assistant message. User matches come first, then the most recent thread. */
export function searchProjections(projections: Iterable<RawProjection>, query: string, limit = 50): RawSearchMatch[] {
  const needle = query.toLowerCase();
  const found: Array<RawSearchMatch & { updatedAt: string }> = [];
  for (const { thread, messages = [] } of projections) {
    if (!thread) continue;
    const hits = messages.filter((m) => !m.streaming && m.role !== "system" && m.text?.toLowerCase().includes(needle));
    const hit = hits.find((m) => m.role === "user") ?? hits.at(-1);
    if (!hit?.text || (hit.role !== "user" && hit.role !== "assistant")) continue;
    const snippet = snippetAround(hit.text, hit.text.toLowerCase().indexOf(needle), needle.length);
    found.push({ threadId: thread.id, projectId: thread.projectId ?? "", source: hit.role, snippet, messageCreatedAt: hit.createdAt ?? null, updatedAt: thread.updatedAt ?? "" });
  }
  const rank = (m: { source: string }) => (m.source === "user" ? 0 : 1);
  found.sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
  return found.slice(0, limit).map(({ updatedAt: _, ...match }) => match);
}

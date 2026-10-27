import type { AgentCard } from "../../lib/threads.ts";

interface CardProps {
  card: AgentCard;
  [prop: string]: unknown;
}

// groupAgents builds new card objects on every run: compare the thread by reference (the live state keeps
// unchanged ones) and the status by value, so only a changed card renders.
export function sameCardProps(a: CardProps, b: CardProps): boolean {
  if (a.card.thread !== b.card.thread || a.card.status !== b.card.status) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("card");
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

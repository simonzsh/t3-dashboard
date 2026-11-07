import type { BoardResult, DashboardThread, LinearInboxKind, LinearIssue } from "../../../../shared/api.ts";
import { boardNeedsKey } from "../settings/linearSettings.ts";

export const FEED_LIMIT = 5;
/** An issue due within this many days (today included) counts as due soon. */
export const DUE_SOON_DAYS = 2;

export type SignalKind = LinearInboxKind | "urgent" | "overdue" | "due-soon";

export interface Signal {
  key: string;
  kind: SignalKind;
  issueId: string;
  identifier: string;
  title: string;
  url: string;
  actor: string | null;
  /** ISO time: the notification date, or the last update of the issue. */
  at: string;
  dueDate: string | null;
}

/** A null count means the inbox could not be read. */
export interface GlanceCounts {
  urgent: number;
  assigned: number | null;
  mentions: number | null;
  due: number;
  overdue: number;
}

const IDENTIFIER = /\b[A-Z][A-Z0-9]*-\d+\b/g;

/** Issue identifiers named in thread titles: assigning an issue titles the thread after it. */
export function linkedIdentifiers(threads: DashboardThread[]): Set<string> {
  return new Set(threads.flatMap((t) => t.title.toUpperCase().match(IDENTIFIER) ?? []));
}

// Due dates are plain days ("YYYY-MM-DD"): compare them with the local day, not with a UTC instant.
const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayIndex = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
};

/** Whole local days from today to the due date: negative when overdue. */
export const daysUntilDue = (dueDate: string, now: Date): number => dayIndex(dueDate) - dayIndex(localDay(now));

const byDue = (a: LinearIssue, b: LinearIssue) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
const byRecent = (a: LinearIssue, b: LinearIssue) => b.updatedAt.localeCompare(a.updatedAt);

function issueSignal(issue: LinearIssue, kind: SignalKind): Signal {
  return { key: `${kind}:${issue.id}`, kind, issueId: issue.id, identifier: issue.identifier, title: issue.title, url: issue.url, actor: null, at: issue.updatedAt, dueDate: issue.dueDate };
}

/** The counters and the feed of the Linear card (the inbox arrives newest first). The feed shows each issue once, by its strongest signal. */
export function glance(board: BoardResult, now: Date): { counts: GlanceCounts; feed: Signal[] } {
  const { issues, inbox } = board;
  const inboxUp = board.inboxError === null;
  const daysLeft = (i: LinearIssue) => (i.dueDate === null ? null : daysUntilDue(i.dueDate, now));
  const overdue = issues.filter((i) => (daysLeft(i) ?? 0) < 0).sort(byDue);
  const dueSoon = issues.filter((i) => {
    const days = daysLeft(i);
    return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
  });
  const urgent = issues.filter((i) => i.priority === 1);
  const counts: GlanceCounts = {
    urgent: urgent.length,
    assigned: inboxUp ? inbox.filter((n) => n.kind === "assigned").length : null,
    mentions: inboxUp ? inbox.filter((n) => n.kind !== "assigned").length : null,
    due: overdue.length + dueSoon.length,
    overdue: overdue.length,
  };
  const dueOf = new Map(issues.map((i) => [i.id, i.dueDate]));
  const signals: Signal[] = [
    ...inbox.map((n): Signal => ({ key: `inbox:${n.id}`, kind: n.kind, issueId: n.issue.id, identifier: n.issue.identifier, title: n.issue.title, url: n.url, actor: n.actor, at: n.createdAt, dueDate: dueOf.get(n.issue.id) ?? null })),
    ...overdue.map((i) => issueSignal(i, "overdue")),
    ...urgent.sort(byRecent).map((i) => issueSignal(i, "urgent")),
    ...dueSoon.sort(byDue).map((i) => issueSignal(i, "due-soon")),
  ];
  const shown = new Set<string>();
  const feed = signals.filter((s) => !shown.has(s.issueId) && shown.add(s.issueId)).slice(0, FEED_LIMIT);
  return { counts, feed };
}

/** The card exists only once Linear is known to be connected (a transient error still counts). */
export const linearCardShown = (board: BoardResult | null): boolean => board !== null && !boardNeedsKey(board);

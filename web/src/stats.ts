import type { Bucket, DashboardProject, DashboardThread } from "../../shared/api.ts";

export interface Kpis {
  total: number;
  buckets: Record<Bucket, number>;
  approvals: number;
  inputs: number;
}

export interface Count {
  label: string;
  count: number;
}

export function kpis(threads: DashboardThread[]): Kpis {
  const out: Kpis = { total: threads.length, buckets: { todo: 0, running: 0, done: 0, inactive: 0 }, approvals: 0, inputs: 0 };
  for (const t of threads) {
    out.buckets[t.bucket]++;
    if (t.pending?.category === "approval") out.approvals++;
    if (t.pending?.category === "user-input") out.inputs++;
  }
  return out;
}

function countBy(threads: DashboardThread[], key: (t: DashboardThread) => string): Count[] {
  const m = new Map<string, number>();
  for (const t of threads) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function byProject(threads: DashboardThread[], projects: DashboardProject[], top = 10): Count[] {
  const titles = new Map(projects.map((p) => [p.id, p.title]));
  const all = countBy(threads, (t) => titles.get(t.projectId) ?? t.projectId);
  if (all.length <= top) return all;
  const rest = all.slice(top).reduce((n, c) => n + c.count, 0);
  return [...all.slice(0, top), { label: "Autres", count: rest }];
}

export function byProvider(threads: DashboardThread[]): Count[] {
  return countBy(threads, (t) => t.provider || "inconnu");
}

function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function byDay(threads: DashboardThread[], now: Date, days = 30): Array<{ day: string; count: number }> {
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    // Date arithmetic on local fields keeps days contiguous across DST changes.
    counts.set(localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), 0);
  }
  for (const t of threads) {
    const k = localDay(new Date(t.createdAt));
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([day, count]) => ({ day, count }));
}

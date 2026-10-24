import type { Bucket, DashboardThread } from "../../shared/api.ts";

export interface Filters {
  projectId: string | null;
  provider: string | null;
  search: string;
}

export const BUCKETS: Bucket[] = ["todo", "running", "done", "inactive"];

export const BUCKET_LABELS: Record<Bucket, string> = {
  todo: "À traiter",
  running: "En cours",
  done: "Terminé",
  inactive: "Inactif",
};

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filterThreads(threads: DashboardThread[], f: Filters): DashboardThread[] {
  const q = normalize(f.search.trim());
  return threads.filter(
    (t) =>
      (f.projectId === null || t.projectId === f.projectId) &&
      (f.provider === null || t.provider === f.provider) &&
      (q === "" || normalize(`${t.title} ${t.preview?.text ?? ""}`).includes(q)),
  );
}

export function groupByBucket(threads: DashboardThread[]): Record<Bucket, DashboardThread[]> {
  const out: Record<Bucket, DashboardThread[]> = { todo: [], running: [], done: [], inactive: [] };
  for (const t of threads) out[t.bucket].push(t);
  for (const b of BUCKETS) {
    out[b].sort((a, c) => Number(c.pinned) - Number(a.pinned) || c.lastActivityAt.localeCompare(a.lastActivityAt));
  }
  return out;
}

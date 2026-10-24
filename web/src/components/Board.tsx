import { useState } from "react";
import type { Bucket, DashboardProject, DashboardThread } from "../../../shared/api.ts";
import { BUCKET_LABELS, BUCKETS, groupByBucket } from "../filters.ts";
import { ThreadCard } from "./ThreadCard.tsx";

const PAGE = 50;

interface Props {
  threads: DashboardThread[];
  projects: DashboardProject[];
  now: Date;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function Board({ threads, projects, now, selectedId, onOpen }: Props) {
  const [shown, setShown] = useState<Record<Bucket, number>>({ todo: PAGE, running: PAGE, done: PAGE, inactive: PAGE });
  const groups = groupByBucket(threads);
  const titles = new Map(projects.map((p) => [p.id, p.title]));
  return (
    <section className="board">
      {BUCKETS.map((b) => {
        const list = groups[b];
        return (
          <div className="column" key={b}>
            <h2>
              {BUCKET_LABELS[b]} <span className="count">{list.length}</span>
            </h2>
            <div className="column-body">
              {list.slice(0, shown[b]).map((t) => (
                <ThreadCard key={t.id} thread={t} projectTitle={titles.get(t.projectId) ?? t.projectId} now={now} selected={t.id === selectedId} onOpen={onOpen} />
              ))}
              {list.length > shown[b] && (
                <button className="more" onClick={() => setShown({ ...shown, [b]: shown[b] + PAGE })}>
                  Afficher plus ({list.length - shown[b]})
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

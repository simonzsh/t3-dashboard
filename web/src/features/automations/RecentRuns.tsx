import type { Automation, AutomationRun, DashboardThread } from "../../../../shared/api.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { relativeTime } from "../../lib/format.ts";
import { Pressable } from "../../ui/index.ts";
import { runDuration } from "./automations.ts";
import { RunBadge } from "./RunBadge.tsx";

interface Props {
  runs: Array<{ automation: Automation; run: AutomationRun }>;
  threads: ReadonlyMap<string, DashboardThread>;
  seen: SeenState;
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
}

/** The latest runs of all automations. A run with no session cannot be opened. */
export function RecentRuns({ runs, threads, seen, now, onOpen }: Props) {
  if (runs.length === 0) return null;
  return (
    <section className="auto-recent" aria-label="Recent runs">
      <h2 className="auto-section-title">Recent runs</h2>
      <ul className="auto-recent-list">
        {runs.map(({ automation, run }) => {
          const { threadId } = run;
          const thread = threadId ? threads.get(threadId) : undefined;
          const duration = runDuration(run, now);
          const body = (
            <>
              <RunBadge run={run} />
              <span className="auto-recent-title">{automation.title}</span>
              <span className="auto-recent-meta">
                {relativeTime(run.startedAt, now)}
                {duration && ` · ${duration}`}
              </span>
              {thread && isUnseen(thread, seen) && <span className="notif-dot" role="img" aria-label="Unread" />}
            </>
          );
          return (
            <li key={`${automation.id}:${threadId ?? run.startedAt}`}>
              {threadId ? (
                <Pressable className="auto-recent-row" onClick={(e) => onOpen(threadId, e.shiftKey)}>
                  {body}
                </Pressable>
              ) : (
                <div className="auto-recent-row static">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import type { Automation, AutomationRun, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { Button } from "../../ui/index.ts";
import { reminderDate, runUnread, runWhen } from "./automations.ts";
import { RunBadge } from "./RunBadge.tsx";

interface Props {
  automation: Automation;
  run: AutomationRun;
  threads: ReadonlyMap<string, DashboardThread>;
  seen: SeenState;
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
}

/** One run of the history: its status pill, the date, the relative time and duration, the error of a failed run and an Open session button. */
export function RunRow({ automation, run, threads, seen, now, onOpen }: Props) {
  const { threadId } = run;
  const thread = threadId ? threads.get(threadId) : undefined;
  return (
    <div className="auto-run-row">
      <span className="auto-run-main">
        <span className="auto-run-line">
          <RunBadge status={run.status} />
          <span className="auto-run-date">{reminderDate(run.startedAt)}</span>
          {runUnread(automation, run, threads, seen) && <span className="notif-dot" role="img" aria-label="Unread" />}
        </span>
        <span className="auto-run-when">{runWhen(run, now, automation.bound)}</span>
        {run.status === "failed" && run.error && <span className="auto-run-error">{run.error}</span>}
      </span>
      {thread && threadId ? (
        <Button size="sm" variant="ghost" onClick={(e) => onOpen(threadId, e.shiftKey)}>
          Open session
        </Button>
      ) : (
        <span className="auto-note">{threadId ? "Session archived" : "No session"}</span>
      )}
    </div>
  );
}

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

/** One run of the history on one line: status pill, date, relative time and duration, unread dot, Open session. */
export function RunRow({ automation, run, threads, seen, now, onOpen }: Props) {
  const { threadId } = run;
  const thread = threadId ? threads.get(threadId) : undefined;
  const unread = runUnread(automation, run, threads, seen);
  // One line: pill, date with "1 d ago · 3 min", unread dot, action. The error of a failed run goes below.
  return (
    <div className="auto-run-row">
      <RunBadge status={run.status} />
      <span className="auto-run-when">
        <span className="auto-run-date">{reminderDate(run.startedAt)}</span> · {runWhen(run, now, automation.bound)}
      </span>
      {unread ? <span className="notif-dot" role="img" aria-label="Unread" /> : <span aria-hidden="true" />}
      {thread && threadId ? (
        <Button size="sm" variant="ghost" onClick={(e) => onOpen(threadId, e.shiftKey)}>
          Open session
        </Button>
      ) : (
        <span className="auto-note">{threadId ? "Session archived" : "No session"}</span>
      )}
      {run.status === "failed" && run.error && <span className="auto-run-error">{run.error}</span>}
    </div>
  );
}

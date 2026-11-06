import type { Automation, AutomationRun, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { Button, Pressable } from "../../ui/index.ts";
import { reminderDate, RUN_LABELS, runTone, runUnread, runWhen } from "./automations.ts";

interface Props {
  automation: Automation;
  run: AutomationRun;
  threads: ReadonlyMap<string, DashboardThread>;
  seen: SeenState;
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
  /** "recent": the whole row opens the session, and shows the task name. "history": an Open session button, no name. */
  variant: "recent" | "history";
}

/** One run: a status dot and word, the date, the relative time and duration, and the error of a failed run. */
export function RunRow({ automation, run, threads, seen, now, onOpen, variant }: Props) {
  const { threadId } = run;
  const thread = threadId ? threads.get(threadId) : undefined;
  const body = (
    <>
      <span className={`run-dot ${runTone(run.status)}`} aria-hidden="true" />
      <span className="run-main">
        <span className="run-line">
          <span className="run-status">{RUN_LABELS[run.status]}</span>
          {variant === "recent" && <span className="run-name">{automation.title}</span>}
          <span className="run-date">{reminderDate(run.startedAt)}</span>
          {runUnread(automation, run, threads, seen) && <span className="notif-dot" role="img" aria-label="Unread" />}
        </span>
        <span className="run-when">{runWhen(run, now)}</span>
        {run.status === "failed" && run.error && <span className="run-error">{run.error}</span>}
      </span>
    </>
  );
  if (variant === "recent") {
    return thread && threadId ? (
      <Pressable className="run-row" onClick={(e) => onOpen(threadId, e.shiftKey)}>
        {body}
      </Pressable>
    ) : (
      <div className="run-row static">{body}</div>
    );
  }
  return (
    <div className="run-row">
      {body}
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

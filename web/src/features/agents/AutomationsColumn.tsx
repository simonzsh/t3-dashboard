import type { Automation, AutomationsResult, DashboardThread } from "../../../../shared/api.ts";
import { lastRunState, nextLabel, reminderDate, splitAutomations } from "./automations.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { Badge, Loader, Pressable } from "../../ui/index.ts";
import { StatusBadge } from "./StatusBadge.tsx";

interface Props {
  result: AutomationsResult | null;
  error: string | null;
  threads: DashboardThread[];
  /** Threads whose agent is still setting a task up. */
  setup: DashboardThread[];
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
}

function Row({ a, thread, now, onOpen }: { a: Automation; thread: DashboardThread | undefined; now: Date; onOpen: (id: string, addOnly: boolean) => void }) {
  const last = lastRunState(a, thread);
  const when = a.kind === "reminder" ? (a.nextRunAt ? reminderDate(a.nextRunAt) : "") : a.scheduleLabel;
  const sub = [a.project, when].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="auto-main">
        <span className="auto-title">{a.title}</span>
        <span className="auto-sub">{sub}</span>
      </span>
      <span className="auto-side">
        <span className="auto-next">{a.enabled ? nextLabel(a.nextRunAt, now) : "paused"}</span>
        {last?.kind === "waiting" && <Badge variant="waiting">Waiting</Badge>}
        {last?.kind === "running" && (
          <Badge variant="running">
            <span className="pulse" aria-hidden="true" />
            Running
          </Badge>
        )}
        {last?.kind === "failed" && (
          <span data-tooltip={last.error ?? "The last run failed"}>
            <Badge variant="error">Failed</Badge>
          </span>
        )}
        {last?.kind === "done" && <Badge variant="done">Finished {last.at}</Badge>}
      </span>
    </>
  );
  const { threadId } = a;
  return (
    <li>
      {threadId ? (
        <Pressable className={`auto-row${last ? ` ${last.kind}` : ""}`} onClick={(e) => onOpen(threadId, e.shiftKey)}>
          {body}
        </Pressable>
      ) : (
        <div className="auto-row">{body}</div>
      )}
    </li>
  );
}

function SetupRow({ thread, onOpen }: { thread: DashboardThread; onOpen: (id: string, addOnly: boolean) => void }) {
  const status = agentStatus(thread);
  return (
    <li>
      <Pressable className={`auto-row ${status === "working" ? "running" : status}`} onClick={(e) => onOpen(thread.id, e.shiftKey)}>
        <span className="auto-main">
          <span className="auto-title">{thread.title}</span>
          <span className="auto-sub">Setting up</span>
        </span>
        <span className="auto-side">
          <StatusBadge thread={thread} status={status} />
        </span>
      </Pressable>
    </li>
  );
}

export function AutomationsColumn({ result, error, threads, setup, now, onOpen }: Props) {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const { routines, reminders } = splitAutomations(result?.automations ?? []);
  const section = (title: string, rows: Automation[], empty: string) => (
    <section className="group">
      <h2>
        {title} <span className="count">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="empty auto-empty">{empty}</p>
      ) : (
        <ul className="auto-list">
          {rows.map((a) => (
            <Row key={a.id} a={a} thread={a.threadId ? byId.get(a.threadId) : undefined} now={now} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <aside className="automations" aria-label="Automations">
      <div className="auto-head">
        <h2 className="auto-heading">Automations</h2>
      </div>
      {setup.length > 0 && (
        <ul className="auto-list">
          {setup.map((t) => (
            <SetupRow key={t.id} thread={t} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {error && <p className="notice error-notice">{error}</p>}
      {!result && !error ? (
        <Loader />
      ) : (
        <>
          {section("Routines", routines, "No routines")}
          {section("Reminders", reminders, "No reminders")}
        </>
      )}
    </aside>
  );
}

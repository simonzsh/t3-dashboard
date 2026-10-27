import type { Automation, AutomationsResult, DashboardProject, DashboardProvider, DashboardThread, ModelDefaults } from "../../../../shared/api.ts";
import { useState } from "react";
import { lastRunState, nextLabel, reminderDate, splitAutomations } from "./automations.ts";
import { Button, Loader, Pressable } from "../../ui/index.ts";
import { AutomationDialog } from "./AutomationDialog.tsx";

interface Props {
  result: AutomationsResult | null;
  error: string | null;
  threads: DashboardThread[];
  /** Threads whose agent is still setting a task up. */
  setup: DashboardThread[];
  now: Date;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  defaults: ModelDefaults;
  onOpen: (id: string, addOnly: boolean) => void;
  onSent: () => void;
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
        {last?.kind === "waiting" && <span className="auto-state waiting">● waiting for your reply</span>}
        {last?.kind === "running" && <span className="auto-state running">● running</span>}
        {last?.kind === "failed" && <span className="auto-state failed" data-tooltip={last.error ?? "The last run failed"}>⚠</span>}
        {last?.kind === "done" && <span className="auto-state done">✓ {last.at}</span>}
      </span>
    </>
  );
  const { threadId } = a;
  return (
    <li>
      {threadId ? (
        <Pressable className="auto-row" onClick={(e) => onOpen(threadId, e.shiftKey)}>
          {body}
        </Pressable>
      ) : (
        <div className="auto-row">{body}</div>
      )}
    </li>
  );
}

function SetupRow({ thread, onOpen }: { thread: DashboardThread; onOpen: (id: string, addOnly: boolean) => void }) {
  const waiting = thread.pending !== null;
  return (
    <li>
      <Pressable className="auto-row" onClick={(e) => onOpen(thread.id, e.shiftKey)}>
        <span className="auto-main">
          <span className="auto-title">{thread.title}</span>
          <span className="auto-sub">Setting up</span>
        </span>
        <span className="auto-side">
          <span className={`auto-state ${waiting ? "waiting" : "running"}`}>{waiting ? "● waiting for your reply" : "● running"}</span>
        </span>
      </Pressable>
    </li>
  );
}

export function AutomationsColumn({ result, error, threads, setup, now, projects, providers, defaults, onOpen, onSent }: Props) {
  const [creating, setCreating] = useState(false);
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
        <Button size="sm" onClick={() => setCreating(true)}>
          Create
        </Button>
      </div>
      {creating && <AutomationDialog projects={projects} providers={providers} defaults={defaults} onClose={() => setCreating(false)} onSent={onSent} />}
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

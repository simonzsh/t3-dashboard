import type { Automation, AutomationsResult, DashboardThread } from "../../../shared/api.ts";
import { lastRunState, nextLabel, reminderDate, splitAutomations } from "../automations.ts";

interface Props {
  result: AutomationsResult | null;
  error: string | null;
  threads: DashboardThread[];
  now: Date;
  onOpen: (id: string) => void;
}

function Row({ a, thread, now, onOpen }: { a: Automation; thread: DashboardThread | undefined; now: Date; onOpen: (id: string) => void }) {
  const last = lastRunState(thread);
  const sub = a.schedule.kind === "cron" ? `${a.brain} · ${a.schedule.label}` : `${a.brain} · ${reminderDate(a.schedule.at)}`;
  const body = (
    <>
      <span className="auto-main">
        <span className="auto-title">{a.title}</span>
        <span className="auto-sub">{sub}</span>
      </span>
      <span className="auto-side">
        <span className="auto-next">{nextLabel(a.nextRunAt, now)}</span>
        {last?.kind === "running" && <span className="auto-state running">● tourne</span>}
        {last?.kind === "failed" && <span className="auto-state failed" title="Le dernier passage a échoué">⚠</span>}
        {last?.kind === "done" && <span className="auto-state done">✓ {last.at}</span>}
      </span>
    </>
  );
  const { threadId } = a;
  return (
    <li>
      {threadId ? (
        <button className="auto-row" onClick={() => onOpen(threadId)}>
          {body}
        </button>
      ) : (
        <div className="auto-row">{body}</div>
      )}
    </li>
  );
}

export function AutomationsColumn({ result, error, threads, now, onOpen }: Props) {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const { routines, reminders } = splitAutomations(result?.automations ?? []);
  const broken = result?.brains.filter((b) => !b.ok) ?? [];
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
            <Row key={`${a.brain}/${a.id}`} a={a} thread={a.threadId ? byId.get(a.threadId) : undefined} now={now} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <aside className="automations" aria-label="Automatisations">
      <h2 className="auto-heading">Automatisations</h2>
      {error && <p className="notice error-notice">{error}</p>}
      {broken.map((b) => (
        <p className="notice" key={b.name}>
          <strong>{b.name}</strong> : {b.error ?? "lecture impossible"}
        </p>
      ))}
      {!result && !error ? (
        <p className="empty">Chargement…</p>
      ) : (
        <>
          {section("Routines", routines, "Aucune routine")}
          {section("Rappels", reminders, "Aucun rappel")}
        </>
      )}
    </aside>
  );
}

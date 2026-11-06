import { useState } from "react";
import type { Automation, AutomationRun, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { Button } from "../../ui/index.ts";
import { RunRow } from "./RunRow.tsx";

const FIRST = 8;
const MORE = 20;

interface Props {
  runs: Array<{ automation: Automation; run: AutomationRun }>;
  threads: ReadonlyMap<string, DashboardThread>;
  seen: SeenState;
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
}

/** The runs of all automations, newest first. A run whose session is gone cannot be opened. */
export function RecentRuns({ runs, threads, seen, now, onOpen }: Props) {
  const [shown, setShown] = useState(FIRST);
  return (
    <section className="auto-section" aria-label="Recent runs">
      <h2 className="auto-section-title">Recent runs</h2>
      <p className="auto-note">Every automation, newest first. Click a run to open its session.</p>
      {runs.length === 0 ? (
        <p className="auto-note">No runs yet</p>
      ) : (
        <div className="auto-card">
          <ul className="auto-rows">
            {runs.slice(0, shown).map(({ automation, run }) => (
              <li key={`${automation.id}:${run.threadId ?? ""}:${run.startedAt}`}>
                <RunRow automation={automation} run={run} threads={threads} seen={seen} now={now} onOpen={onOpen} variant="recent" />
              </li>
            ))}
          </ul>
        </div>
      )}
      {runs.length > shown && (
        <Button className="run-more" variant="ghost" size="sm" onClick={() => setShown((n) => n + MORE)}>
          Show older runs
        </Button>
      )}
    </section>
  );
}

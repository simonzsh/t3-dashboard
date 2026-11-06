import { useCallback, useEffect, useMemo, useState } from "react";
import type { Automation, AutomationsResult, DashboardState, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { RunningBadge, StatusBadge } from "../../lib/StatusBadge.tsx";
import { Badge, Button, Icon, Pressable, Skeleton, SkeletonGroup, TextInput, useEscape } from "../../ui/index.ts";
import { NewAutomationDialog } from "../new-thread/NewAutomationDialog.tsx";
import { AutomationRow } from "./AutomationRow.tsx";
import { AutomationSheet } from "./AutomationSheet.tsx";
import { filterAutomations, recentRuns, sortAutomations } from "./automations.ts";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog.tsx";
import { RecentRuns } from "./RecentRuns.tsx";
import { useAutomationActions } from "./useAutomationActions.ts";

interface Props {
  state: DashboardState;
  now: Date;
  seen: SeenState;
  onOpen: (id: string, addOnly: boolean) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  onAutomationsStale: () => Promise<void>;
  onNewAutomation: () => void;
  /** Setup rows from `useSetupRows`, owned by App. */
  setup: DashboardThread[];
}

// Below this a search box is noise.
const SEARCH_FROM = 7;

function Skeletons() {
  return (
    <SkeletonGroup label="Loading automations">
      <div className="auto-card">
        <ul className="auto-rows">
          {[0, 1, 2].map((i) => (
            <li key={i} className="auto-skeleton">
              <Skeleton width="40%" height={14} />
              <Skeleton width="60%" />
              <Skeleton width="30%" />
            </li>
          ))}
        </ul>
      </div>
    </SkeletonGroup>
  );
}

export function AutomationsView({ state, now, seen, onOpen, automations, automationsError, onAutomationsStale, onNewAutomation, setup }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const actions = useAutomationActions(onAutomationsStale);
  const threads = useMemo(() => new Map(state.threads.map((t) => [t.id, t])), [state.threads]);
  const projects = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);
  const { withPending } = actions;
  const all = useMemo(() => withPending(automations?.automations ?? []), [automations, withPending]);
  const sorted = useMemo(() => sortAutomations(filterAutomations(all, query), threads, seen), [all, query, threads, seen]);
  const recent = useMemo(() => recentRuns(all, threads), [all, threads]);
  const selected = all.find((a) => a.id === selectedId) ?? null;

  // The task was deleted, here or elsewhere: nothing stays selected.
  useEffect(() => {
    if (selectedId !== null && !selected && automations) setSelectedId(null);
  }, [selectedId, selected, automations]);
  const close = useCallback(() => setSelectedId(null), []);
  const dialogOpen = editing !== null || deleting !== null;
  useEscape(() => {
    if (selected && !dialogOpen) close();
  });

  if (state.connection.t3 !== "live") {
    return (
      <div className="empty-state">
        <strong>T3 Code is not connected</strong>
        <span>Automations show here once the connection is back.</span>
      </div>
    );
  }
  if (!automations && !automationsError) return <div className="auto-page"><Skeletons /></div>;
  if (!automations) {
    return (
      <div className="empty-state">
        <strong>Automations could not be loaded</strong>
        <span>{automationsError}</span>
      </div>
    );
  }
  if (all.length === 0 && setup.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="calendarClock" />
        <strong>No automations yet</strong>
        <span>Routines, reminders and webhooks appear here.</span>
        <Button variant="primary" onClick={onNewAutomation}>
          New automation
        </Button>
      </div>
    );
  }
  return (
    <div className="auto-page">
      <section className="auto-section" aria-label="Automations">
        {all.length >= SEARCH_FROM && (
          <div className="auto-search">
            <Icon name="search" />
            <TextInput aria-label="Search automations" placeholder="Search automations…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}
        <div className="auto-card">
          <ul className="auto-rows">
            {setup.map((t) => (
              <li key={t.id}>
                <div className="auto-row">
                  <Pressable className="auto-row-main" onClick={(e) => onOpen(t.id, e.shiftKey)}>
                    <span className="auto-line">
                      <span className="auto-name">{t.title}</span>
                      <Badge>Setting up</Badge>
                      <StatusBadge thread={t} status={agentStatus(t)} />
                    </span>
                  </Pressable>
                </div>
              </li>
            ))}
            {sorted.map((a) => (
              <li key={a.id}>
                <AutomationRow
                  automation={a}
                  threads={threads}
                  seen={seen}
                  now={now}
                  starting={actions.starting.has(a.id)}
                  onSelect={setSelectedId}
                  onToggle={actions.toggle}
                  onRun={actions.run}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              </li>
            ))}
            {sorted.length === 0 && setup.length === 0 && <li className="auto-empty">No automation matches</li>}
          </ul>
        </div>
      </section>
      <RecentRuns runs={recent} threads={threads} seen={seen} now={now} onOpen={onOpen} />
      {selected && (
        <AutomationSheet
          automation={selected}
          threads={threads}
          project={projects.get(selected.projectId)}
          providers={state.providers}
          seen={seen}
          now={now}
          starting={actions.starting.has(selected.id)}
          onClose={close}
          onOpen={onOpen}
          onToggle={actions.toggle}
          onRun={actions.run}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
      )}
      {editing && (
        <NewAutomationDialog
          projects={state.projects}
          providers={state.providers}
          defaults={state.modelDefaults}
          automation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void onAutomationsStale()}
        />
      )}
      {deleting && (
        <DeleteAutomationDialog
          automation={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void onAutomationsStale();
          }}
        />
      )}
    </div>
  );
}

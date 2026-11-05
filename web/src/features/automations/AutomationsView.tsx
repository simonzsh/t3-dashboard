import { useMemo, useState, type ReactNode } from "react";
import type { Automation, AutomationsResult, DashboardProvider, DashboardState, DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { RunningBadge, StatusBadge } from "../../lib/StatusBadge.tsx";
import { Badge, Button, Dropdown, Icon, IconButton, Loader, Pressable, TextInput } from "../../ui/index.ts";
import { automationProjects, copyableUrl, filterAutomations, groupAutomations, isEditable, isFinishedReminder, lastRunState, modelLabel, nextLabel, scheduleText, type AutomationGroup } from "./automations.ts";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog.tsx";
import { NewAutomationDialog } from "../new-thread/NewAutomationDialog.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";

interface Props {
  state: DashboardState;
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  onAutomationsStale: () => Promise<void>;
  onNewAutomation: () => void;
  /** Setup rows from `useSetupRows`, owned by App. */
  setup: DashboardThread[];
}

const COLUMNS = 7;
const GROUPS: ReadonlyArray<{ id: AutomationGroup; title: string }> = [
  { id: "attention", title: "Needs attention" },
  { id: "today", title: "Today" },
  { id: "upcoming", title: "Upcoming" },
  { id: "inactive", title: "Paused / finished" },
];
// T3 gives "" to a task without a project: "all" needs an id no task can have.
const ALL_PROJECTS = "*all";

function CopyUrlButton({ url }: { url: string }) {
  const { copied, copy } = useCopy("copy the webhook URL");
  return (
    <IconButton label="Copy webhook URL" tooltip="Copy webhook URL" size="sm" variant="ghost" onClick={() => copy(url)}>
      <Icon name={copied ? "check" : "copy"} />
    </IconButton>
  );
}

interface RowProps {
  a: Automation;
  thread: DashboardThread | undefined;
  projectIcon: DashboardState["projects"][number]["icon"];
  providers: DashboardProvider[];
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
  onEdit: (a: Automation) => void;
  onDelete: (a: Automation) => void;
}

function Row({ a, thread, projectIcon, providers, now, onOpen, onEdit, onDelete }: RowProps) {
  const last = lastRunState(a, thread);
  const hook = a.kind === "webhook";
  const url = copyableUrl(a);
  const { threadId } = a;
  const model = modelLabel(providers, a.modelSelection);
  const next = isFinishedReminder(a) || (hook && a.enabled) ? "—" : a.enabled ? nextLabel(a.nextRunAt, now) || "—" : "paused";
  return (
    <tr className={last ? last.kind : undefined}>
      <td data-label="Name" className="auto-name">
        {threadId ? (
          <Pressable className="auto-open" onClick={(e) => onOpen(threadId, e.shiftKey)}>
            {a.title}
          </Pressable>
        ) : (
          <span>{a.title}</span>
        )}
        {hook && !a.webhook?.signed && <span className="auto-note">unsigned</span>}
      </td>
      <td data-label="Project">
        <ProjectTag icon={projectIcon} title={a.project} />
      </td>
      <td data-label="Model">
        {model && (
          <span className="auto-model">
            <ProviderIcon provider={model.instanceId} />
            {model.name}
          </span>
        )}
      </td>
      <td data-label="Schedule">{scheduleText(a)}</td>
      <td data-label="Next run">{next}</td>
      <td data-label="Last result">
        {last?.kind === "waiting" && <Badge variant="waiting">Waiting</Badge>}
        {last?.kind === "running" && <RunningBadge />}
        {last?.kind === "failed" && (
          <span data-tooltip={last.error ?? "The last run failed"}>
            <Badge variant="error">Error</Badge>
          </span>
        )}
        {last?.kind === "done" && <Badge variant="done">Finished {last.at}</Badge>}
      </td>
      <td className="auto-actions">
        {url && <CopyUrlButton url={url} />}
        {isEditable(a) ? (
          <IconButton label="Edit automation" tooltip="Edit" size="sm" variant="ghost" onClick={() => onEdit(a)}>
            <Icon name="edit" />
          </IconButton>
        ) : (
          // A disabled button gets no hover events: the wrapper carries the tooltip.
          <span data-tooltip="This automation can't be edited here">
            <IconButton label="Edit automation" size="sm" variant="ghost" disabled>
              <Icon name="edit" />
            </IconButton>
          </span>
        )}
        <IconButton label="Delete automation" tooltip="Delete" size="sm" variant="ghost" onClick={() => onDelete(a)}>
          <Icon name="trash" />
        </IconButton>
      </td>
    </tr>
  );
}

function SetupRow({ thread, onOpen }: { thread: DashboardThread; onOpen: (id: string, addOnly: boolean) => void }) {
  return (
    <tr className="auto-setup">
      <td data-label="Name" className="auto-name">
        <Pressable className="auto-open" onClick={(e) => onOpen(thread.id, e.shiftKey)}>
          {thread.title}
        </Pressable>
        <span className="auto-note">Setting up</span>
      </td>
      <td colSpan={COLUMNS - 2} />
      <td data-label="Status">
        <StatusBadge thread={thread} status={agentStatus(thread)} />
      </td>
    </tr>
  );
}

// Closed by default: paused and finished tasks need nothing from the user.
function GroupHead({ title, count, open, onToggle }: { title: string; count: number; open?: boolean; onToggle?: () => void }) {
  const text: ReactNode = (
    <>
      {onToggle && <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />}
      {title} <span className="count">{count}</span>
    </>
  );
  return (
    <tr className="auto-group">
      <th colSpan={COLUMNS} scope="colgroup">
        {onToggle ? (
          <Pressable className="auto-group-toggle" aria-expanded={open} onClick={onToggle}>
            {text}
          </Pressable>
        ) : (
          text
        )}
      </th>
    </tr>
  );
}

export function AutomationsView({ state, now, onOpen, automations, automationsError, onAutomationsStale, onNewAutomation, setup }: Props) {
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState(ALL_PROJECTS);
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const threads = useMemo(() => new Map(state.threads.map((t) => [t.id, t])), [state.threads]);
  const icons = useMemo(() => new Map(state.projects.map((p) => [p.id, p.icon])), [state.projects]);
  const all = automations?.automations ?? [];
  const shown = useMemo(() => filterAutomations(all, { projectId: projectId === ALL_PROJECTS ? null : projectId, query }), [all, projectId, query]);
  const groups = useMemo(() => groupAutomations(shown, threads, now), [shown, threads, now]);
  const options = useMemo(() => [{ id: ALL_PROJECTS, label: "All projects" }, ...automationProjects(all).map((p) => ({ id: p.id, label: p.title, icon: <ProjectIcon icon={icons.get(p.id) ?? null} /> }))], [all, icons]);

  if (state.connection.t3 !== "live") {
    return (
      <div className="empty-state">
        <strong>T3 Code is not connected</strong>
        <span>Automations show here once the connection is back.</span>
      </div>
    );
  }
  if (!automations && !automationsError) return <Loader />;
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
        <strong>No automations yet</strong>
        <span>Routines, reminders and webhooks appear here.</span>
        <Button variant="primary" onClick={onNewAutomation}>
          New Automation
        </Button>
      </div>
    );
  }
  const rows = (list: Automation[]) => list.map((a) => <Row key={a.id} a={a} thread={a.threadId ? threads.get(a.threadId) : undefined} projectIcon={icons.get(a.projectId) ?? null} providers={state.providers} now={now} onOpen={onOpen} onEdit={setEditing} onDelete={setDeleting} />);
  return (
    <div className="auto-page">
      <div className="auto-toolbar">
        <div className="auto-search">
          <Icon name="search" />
          <TextInput aria-label="Search automations" placeholder="Search automations…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Dropdown label="Project" value={projectId} options={options} onPick={setProjectId} filterable searchPlaceholder="Search projects…" />
      </div>
      {shown.length === 0 && setup.length === 0 ? (
        <div className="empty-state">
          <strong>No automation matches</strong>
          <span>Change the search or the project.</span>
        </div>
      ) : (
        <div className="auto-scroll">
          <table className="auto-table">
            <thead>
              <tr>
                {["Name", "Project", "Model", "Schedule", "Next run", "Last result"].map((name) => (
                  <th key={name} scope="col">
                    {name}
                  </th>
                ))}
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            {setup.length > 0 && (
              <tbody>
                {setup.map((t) => (
                  <SetupRow key={t.id} thread={t} onOpen={onOpen} />
                ))}
              </tbody>
            )}
            {GROUPS.map(({ id, title }) => {
              const list = groups[id];
              if (list.length === 0) return null;
              const collapsible = id === "inactive";
              return (
                <tbody key={id}>
                  <GroupHead title={title} count={list.length} open={inactiveOpen} onToggle={collapsible ? () => setInactiveOpen(!inactiveOpen) : undefined} />
                  {(!collapsible || inactiveOpen) && rows(list)}
                </tbody>
              );
            })}
          </table>
        </div>
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

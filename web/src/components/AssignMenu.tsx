import { useState } from "react";
import type { DashboardProject, LinearIssue } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { browserStorage, loadAssignProject, saveAssignProject } from "../assignProject.ts";
import { projectOptions } from "../dropdown.ts";
import { Dropdown } from "./Dropdown.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { useAction } from "./useAction.ts";

interface Props {
  issue: LinearIssue;
  projects: DashboardProject[];
  onAssigned: (threadId: string) => void;
  onShowDesk: () => void;
}

export function AssignMenu({ issue, projects, onAssigned, onShowDesk }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [projectId, setProjectId] = useState("");
  const { busy, error, run } = useAction();

  async function assign(agent: "claude" | "codex") {
    setOpen(false);
    let threadId = "";
    const ok = await run(async () => {
      threadId = (await api.assignIssue({ workspace: issue.workspace, issueId: issue.id, agent, projectId })).threadId;
    });
    if (!ok) return;
    saveAssignProject(browserStorage(), issue.team.key, projectId);
    setDone(true);
    onAssigned(threadId);
  }

  return (
    <div className="assign">
      {done ? (
        <span className="confirm">
          <svg className="icon" viewBox="0 0 24 24" role="img" aria-label="Session created">
            <title>Session created</title>
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <button className="link" onClick={onShowDesk}>
            View on Desk
          </button>
        </span>
      ) : (
        <button
          className="icon-button"
          disabled={busy}
          aria-expanded={open}
          aria-label="Assign to an agent"
          title="Assign to an agent"
          onClick={() => {
            // The last project chosen for this team is preselected: the browser remembers it.
            if (!open) setProjectId(loadAssignProject(browserStorage(), issue.team.key, projects));
            setOpen(!open);
          }}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="8" r="3.5" />
              <path d="M3.5 19.5c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
              <path d="M19 6v6M16 9h6" />
            </g>
          </svg>
        </button>
      )}
      {open && (
        <div className="menu" role="menu">
          <div className="menu-project">
            <small>T3 project</small>
            <Dropdown
              className="field"
              label="T3 project"
              placeholder={projects.length === 0 ? "No T3 project yet" : "Choose a project…"}
              value={projectId || null}
              options={projectOptions(projects)}
              filterable
              disabled={projects.length === 0}
              onPick={setProjectId}
            />
          </div>
          <button role="menuitem" disabled={projectId === ""} onClick={() => assign("claude")}>
            <ProviderIcon provider="claudeAgent" /> Claude
          </button>
          <button role="menuitem" disabled={projectId === ""} onClick={() => assign("codex")}>
            <ProviderIcon provider="codex" /> Codex
          </button>
        </div>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

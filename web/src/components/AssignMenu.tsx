import { useState } from "react";
import type { DashboardProject, LinearIssue } from "../../../shared/api.ts";
import { api } from "../api.ts";
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
  // The team has no T3 project yet: ask once, the server remembers the answer for the team.
  const needsProject = issue.t3ProjectId === null;
  const { busy, error, run } = useAction();

  async function assign(agent: "claude" | "codex") {
    setOpen(false);
    let threadId = "";
    const ok = await run(async () => {
      threadId = (await api.assignIssue({ workspace: issue.workspace, issueId: issue.id, agent, ...(needsProject && { projectId }) })).threadId;
    });
    if (!ok) return;
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
          onClick={() => setOpen(!open)}
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
          {needsProject && (
            <label className="menu-project">
              <small>T3 project for team {issue.team.key}</small>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="" disabled>
                  {projects.length === 0 ? "No T3 project yet" : "Choose a project…"}
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button role="menuitem" disabled={needsProject && projectId === ""} onClick={() => assign("claude")}>
            <ProviderIcon provider="claudeAgent" /> Claude
          </button>
          <button role="menuitem" disabled={needsProject && projectId === ""} onClick={() => assign("codex")}>
            <ProviderIcon provider="codex" /> Codex
          </button>
        </div>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

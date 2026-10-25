import { useRef, useState } from "react";
import type { DashboardProject, LinearIssue } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { browserStorage, loadAssignProject, saveAssignProject } from "../assignProject.ts";
import { projectOptions } from "../dropdown.ts";
import { Button, Dropdown, Icon, IconButton, Popover, Pressable } from "../ui/index.ts";
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
  const button = useRef<HTMLButtonElement>(null);
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
          <span role="img" aria-label="Session created" title="Session created">
            <Icon name="check" strokeWidth={2.2} />
          </span>
          <Button variant="link" onClick={onShowDesk}>
            View on Desk
          </Button>
        </span>
      ) : (
        <IconButton
          ref={button}
          label="Assign to an agent"
          size="sm"
          disabled={busy}
          aria-expanded={open}
          onClick={() => {
            // The last project chosen for this team is preselected: the browser remembers it.
            if (!open) setProjectId(loadAssignProject(browserStorage(), issue.team.key, projects));
            setOpen(!open);
          }}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="9" width="13" height="10" rx="2.5" />
              <path d="M9 9V6M1 13.5v2M17 13.5v2" />
              <circle cx="9" cy="4.8" r="1.2" />
              <circle cx="6.3" cy="13.5" r="0.6" fill="currentColor" />
              <circle cx="11.7" cy="13.5" r="0.6" fill="currentColor" />
              <path d="M7 16.4h4" />
              <path d="M20 3v6M17 6h6" />
            </g>
          </svg>
        </IconButton>
      )}
      {open && (
        <Popover anchor={button} className="menu" role="menu" align="end" minWidth={200} onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") button.current?.focus();
        }}>
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
          <Pressable role="menuitem" disabled={projectId === ""} onClick={() => assign("claude")}>
            <ProviderIcon provider="claudeAgent" /> Claude
          </Pressable>
          <Pressable role="menuitem" disabled={projectId === ""} onClick={() => assign("codex")}>
            <ProviderIcon provider="codex" /> Codex
          </Pressable>
        </Popover>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

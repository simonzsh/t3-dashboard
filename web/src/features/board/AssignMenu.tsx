import { useRef, useState } from "react";
import type { DashboardProject, LinearIssue } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { loadAssignProject, saveAssignProject } from "../../lib/assignProject.ts";
import { browserStorage } from "../../lib/storage.ts";
import { ProjectPicker } from "../../lib/ProjectPicker.tsx";
import { Button, Icon, IconButton, Popover, Pressable } from "../../ui/index.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { useAction } from "../../lib/useAction.ts";

interface Props {
  issue: LinearIssue;
  projects: DashboardProject[];
  onAssigned: (threadId: string) => void;
  onShowDesk: () => void;
}

export function AssignMenu({ issue, projects, onAssigned, onShowDesk }: Props) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [projectId, setProjectId] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const { busy, error, run } = useAction();

  async function assign(agent: "claude" | "codex") {
    setOpen(false);
    let threadId = "";
    const ok = await run(async () => {
      threadId = (await api.assignIssue({ issueId: issue.id, agent, projectId })).threadId;
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
          <Icon name="assignBot" strokeWidth={1.8} />
        </IconButton>
      )}
      {open && (
        <Popover anchor={button} className="menu" role="menu" align="end" minWidth={200} onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") button.current?.focus();
        }}>
          <div className="menu-project">
            <small>T3 project</small>
            <ProjectPicker label="T3 project" projects={projects} value={projectId} onPick={setProjectId} />
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

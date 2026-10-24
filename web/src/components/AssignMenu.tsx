import { useState } from "react";
import type { LinearIssue } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { useAction } from "./useAction.ts";

export function AssignMenu({ issue, onShowAgents }: { issue: LinearIssue; onShowAgents: () => void }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();

  async function assign(agent: "claude" | "codex") {
    setOpen(false);
    if (await run(() => api.assignIssue({ workspace: issue.workspace, issueId: issue.id, agent }))) setDone(true);
  }

  return (
    <div className="assign">
      {done ? (
        <span className="confirm">
          Session créée.{" "}
          <button className="link" onClick={onShowAgents}>
            Voir les agents
          </button>
        </span>
      ) : (
        <button disabled={busy} aria-expanded={open} onClick={() => setOpen(!open)}>
          {busy ? "Création…" : "Assigner à un agent"}
        </button>
      )}
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => assign("claude")}>
            <ProviderIcon provider="claudeAgent" /> Claude
          </button>
          <button role="menuitem" onClick={() => assign("codex")}>
            <ProviderIcon provider="codex" /> Codex
          </button>
        </div>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

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
          <svg className="icon" viewBox="0 0 24 24" role="img" aria-label="Session créée">
            <title>Session créée</title>
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <button className="link" onClick={onShowAgents}>
            Voir les agents
          </button>
        </span>
      ) : (
        <button
          className="icon-button"
          disabled={busy}
          aria-expanded={open}
          aria-label="Assigner à un agent"
          title="Assigner à un agent"
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

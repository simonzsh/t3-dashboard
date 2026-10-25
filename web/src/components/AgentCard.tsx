import type { AgentCard as Card } from "../agents.ts";
import { pendingLabel } from "../agents.ts";
import { cut, relativeTime } from "../format.ts";
import { OpenInT3 } from "./OpenInT3.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";

interface Props {
  card: Card;
  now: Date;
  onDesk: boolean;
  t3EnvironmentId: string | null;
  // addOnly: put the agent on the Desk without leaving the current tab.
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
}

export function AgentCard({ card, now, onDesk, t3EnvironmentId, onOpen, onToggleDesk }: Props) {
  const { thread: t, status } = card;
  const failed = t.status === "failed" || t.lastError !== null;
  return (
    <div className="agent-wrap">
      <button className={`agent ${status}${onDesk ? " on-desk" : ""}`} onClick={(e) => onOpen(t.id, e.shiftKey)}>
        <span className="agent-head">
          <ProviderIcon provider={t.provider} />
          <span className="agent-title">{t.title || "(untitled)"}</span>
        </span>
        {t.preview && <span className="agent-preview">{cut(t.preview.text, 160)}</span>}
        <span className="agent-foot">
          {status === "waiting" && <span className="pill waiting">Waiting for your reply{t.pending ? ` · ${pendingLabel(t.pending.category).toLowerCase()}` : ""}</span>}
          {status === "working" && (
            <span className="pill working">
              <span className="pulse" aria-hidden="true" />
              Running
            </span>
          )}
          {status === "finished" && <span className={`pill ${failed ? "failed" : "finished"}`}>{failed ? "Error" : "Finished"}</span>}
          {t.pinned && <span className="pill pinned">Pinned</span>}
          <span className="agent-meta">{relativeTime(t.lastActivityAt, now)}</span>
        </span>
      </button>
      <OpenInT3 environmentId={t3EnvironmentId} threadId={t.id} className="card-open-t3" />
      <button
        className={`icon-button desk-toggle${onDesk ? " on" : ""}`}
        aria-label="Add to Desk"
        aria-pressed={onDesk}
        title={onDesk ? "On Desk (click to remove)" : "Add to Desk"}
        onClick={() => onToggleDesk(t.id)}
      >
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d={onDesk ? "M5 12.5l4.5 4.5L19 7.5" : "M12 5v14M5 12h14"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

import type { AgentCard as Card } from "../agents.ts";
import { pendingLabel } from "../agents.ts";
import { cut, relativeTime } from "../format.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";

interface Props {
  card: Card;
  now: Date;
  selected: boolean;
  onOpen: (id: string) => void;
}

export function AgentCard({ card, now, selected, onOpen }: Props) {
  const { thread: t, status } = card;
  const failed = t.status === "failed" || t.lastError !== null;
  return (
    <button className={`agent ${status}${selected ? " selected" : ""}`} onClick={() => onOpen(t.id)}>
      <span className="agent-head">
        <ProviderIcon provider={t.provider} />
        <span className="agent-title">{t.title || "(untitled)"}</span>
      </span>
      <span className="agent-meta">
        {t.model ?? t.provider} · {relativeTime(t.lastActivityAt, now)}
      </span>
      <span className="agent-status">
        {status === "waiting" && <span className="pill waiting">Waiting for your reply{t.pending ? ` · ${pendingLabel(t.pending.category).toLowerCase()}` : ""}</span>}
        {status === "working" && (
          <span className="pill working">
            <span className="pulse" aria-hidden="true" />
            Running
          </span>
        )}
        {status === "finished" && <span className={`pill ${failed ? "failed" : "finished"}`}>{failed ? "Error" : "Finished"}</span>}
        {t.pinned && <span className="pill pinned">Pinned</span>}
      </span>
      {t.preview && <span className="agent-preview">{cut(t.preview.text, 160)}</span>}
    </button>
  );
}

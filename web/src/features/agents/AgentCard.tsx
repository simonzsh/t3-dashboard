import { useRef } from "react";
import type { AgentCard as Card } from "../../lib/threads.ts";
import { pendingLabel, threadTitle } from "../../lib/threads.ts";
import { hasFailed } from "../../../../shared/status.ts";
import { relativeTime } from "../../lib/format.ts";
import { tabSelector } from "../../lib/tabs.ts";
import { Badge, Icon, IconButton, Pressable, fly } from "../../ui/index.ts";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";

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
  const failed = hasFailed(t);
  const cardRef = useRef<HTMLButtonElement>(null);
  // Adding without leaving the tab: the card flies to the Desk tab so the user sees where it went.
  const flyToDesk = () => {
    if (!onDesk && cardRef.current) fly(cardRef.current, document.querySelector(tabSelector("desk")));
  };
  return (
    <div className="agent-wrap">
      <Pressable
        ref={cardRef}
        className={`agent ${status}${onDesk ? " on-desk" : ""}`}
        onClick={(e) => {
          if (e.shiftKey) flyToDesk();
          onOpen(t.id, e.shiftKey);
        }}
      >
        <span className="agent-head">
          <ProviderIcon provider={t.provider} />
          <span className="agent-title">{threadTitle(t)}</span>
        </span>
        <span className="agent-foot">
          {status === "waiting" && <Badge variant="waiting">Waiting for your reply{t.pending ? ` · ${pendingLabel(t.pending.category).toLowerCase()}` : ""}</Badge>}
          {status === "working" && (
            <Badge variant="running">
              <span className="pulse" aria-hidden="true" />
              Running
            </Badge>
          )}
          {status === "finished" && <Badge variant={failed ? "error" : "done"}>{failed ? "Error" : "Finished"}</Badge>}
          {t.pinned && <Badge>Pinned</Badge>}
          <span className="agent-meta">{relativeTime(t.lastActivityAt, now)}</span>
        </span>
      </Pressable>
      <OpenInT3 environmentId={t3EnvironmentId} threadId={t.id} className="card-open-t3 sm" />
      <IconButton
        label="Add to Desk"
        size="sm"
        className={`desk-toggle${onDesk ? " on" : ""}`}
        aria-pressed={onDesk}
        tooltip={onDesk ? "On Desk (click to remove)" : "Add to Desk"}
        onClick={() => {
          flyToDesk();
          onToggleDesk(t.id);
        }}
      >
        <Icon name={onDesk ? "check" : "plus"} />
      </IconButton>
    </div>
  );
}

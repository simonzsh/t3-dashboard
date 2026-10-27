import { memo, useRef } from "react";
import type { AgentCard as Card } from "../../lib/threads.ts";
import { threadTitle } from "../../lib/threads.ts";
import { relativeTime } from "../../lib/format.ts";
import { tabSelector } from "../../lib/tabs.ts";
import { Icon, IconButton, Pressable, fly } from "../../ui/index.ts";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { useAction } from "../../lib/useAction.ts";
import { sameCardProps } from "./cardProps.ts";
import { StatusBadge } from "./StatusBadge.tsx";

interface Props {
  card: Card;
  now: Date;
  onDesk: boolean;
  t3EnvironmentId: string | null;
  // addOnly: put the agent on the Desk without leaving the current tab.
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
}

function AgentCardView({ card, now, onDesk, t3EnvironmentId, onOpen, onToggleDesk, onSettle }: Props) {
  const { thread: t, status } = card;
  const { busy, error, run } = useAction();
  // T3 refuses to settle a thread that runs or waits; unsettling is always allowed.
  const canSettle = !t.settled && (status === "finished" || status === "idle");
  // A settled card that is not active looks greyed, so it stands out from live ones in an opened list.
  const quiet = t.settled && (status === "finished" || status === "idle");
  const cardRef = useRef<HTMLButtonElement>(null);
  // Adding without leaving the tab: the card flies to the Desk tab so the user sees where it went.
  const flyToDesk = () => {
    if (!onDesk && cardRef.current) fly(cardRef.current, document.querySelector(tabSelector("desk")));
  };
  // Settling: the card flies to its group's "Recently settled" line (the group title when there is none yet).
  // Unsettling: it flies back to the group title.
  const flyToSettled = () => {
    const group = cardRef.current?.closest(".group");
    if (!cardRef.current || !group) return;
    const target = t.settled ? group.querySelector("h2") : (group.querySelector(".settled-head") ?? group.querySelector("h2"));
    fly(cardRef.current, target);
  };
  return (
    <div className={`agent-wrap${canSettle || t.settled ? " can-settle" : ""}`}>
      <Pressable
        ref={cardRef}
        className={`agent ${status}${onDesk ? " on-desk" : ""}${quiet ? " is-settled" : ""}`}
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
          <StatusBadge thread={t} status={status} />
          {t.pinned && <Icon name="pin" label="Pinned" className="agent-pin" />}
          <span className="agent-meta">{relativeTime(t.lastActivityAt, now)}</span>
        </span>
      </Pressable>
      <div className="agent-actions">
        <OpenInT3 environmentId={t3EnvironmentId} threadId={t.id} className="card-open-t3 sm" />
        {(canSettle || t.settled) && (
          <IconButton
            label={t.settled ? "Unsettle" : "Settle"}
            size="sm"
            variant={error ? "danger" : "secondary"}
            disabled={busy}
            tooltip={error ?? (t.settled ? "Unsettle" : "Settle")}
            onClick={() => {
              flyToSettled();
              run(() => onSettle(t.id, !t.settled));
            }}
          >
            <Icon name={t.settled ? "unarchive" : "archive"} />
          </IconButton>
        )}
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
    </div>
  );
}

export const AgentCard = memo(AgentCardView, sameCardProps);

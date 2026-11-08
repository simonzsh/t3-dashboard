import { useState } from "react";
import type { TurnStep } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { duration } from "../../lib/format.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { useAction } from "../../lib/useAction.ts";
import { Chevron, Icon, IconButton, Pressable } from "../../ui/index.ts";
import { useTicker } from "./Steps.tsx";
import { MAX_AVATARS, SUBAGENT_LABELS, groupElapsedMs, groupStatus, isActive, subagentLine, subagentTone } from "./subagents.ts";

interface RowsProps {
  steps: TurnStep[];
  threadId: string;
  onOpenThread?: (id: string) => void;
  /** The stop changes the state in T3: the panel reloads. */
  onChanged: () => void;
}

const elapsedLabel = (steps: TurnStep[], now: number): string | null => {
  const ms = groupElapsedMs(steps, now);
  return ms === null ? null : duration(ms);
};

function Avatar({ step, dot = true }: { step: TurnStep; dot?: boolean }) {
  return (
    <span className="subagent-avatar">
      <ProviderIcon provider={step.subagent?.provider ?? "subagent"} />
      {dot && <span className={`subagent-dot ${subagentTone(step)}`} aria-hidden="true" />}
    </span>
  );
}

/** One subagent alone is a bare row; two or more of one turn get a header and a card. */
export function SubagentRows(props: RowsProps) {
  return props.steps.length === 1 ? <SubagentRow {...props} step={props.steps[0]!} /> : <SubagentGroup {...props} />;
}

function SubagentGroup({ steps, ...rest }: RowsProps) {
  const [open, setOpen] = useState(false);
  const active = steps.some(isActive);
  const now = useTicker(active);
  const { text, tone } = groupStatus(steps);
  const elapsed = elapsedLabel(steps, now);
  const extra = steps.length - MAX_AVATARS;
  return (
    <section className="subagent-group">
      <Pressable className={`subagent-group-head${open || active ? "" : " idle"}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="subagent-avatars">
          {steps.slice(0, MAX_AVATARS).map((step) => (
            <Avatar key={step.id} step={step} dot={false} />
          ))}
          {extra > 0 && <span className="subagent-avatar subagent-more">+{extra}</span>}
        </span>
        <span className="subagent-group-text">
          <span className="subagent-group-title">{steps.length} subagents</span>
          <span className={`subagent-group-status ${tone}`}>{text}</span>
        </span>
        {elapsed && <span className="subagent-time">{elapsed}</span>}
        <Chevron open={open} opensUp />
      </Pressable>
      {open && (
        <div className="subagent-card">
          {steps.map((step) => (
            <SubagentRow key={step.id} step={step} {...rest} />
          ))}
        </div>
      )}
    </section>
  );
}

function SubagentRow({ step, threadId, onOpenThread, onChanged }: Omit<RowsProps, "steps"> & { step: TurnStep }) {
  const api = useApi();
  const sub = step.subagent;
  const now = useTicker(isActive(step));
  const [stopping, setStopping] = useState(false);
  const action = useAction("stop the subagent");
  if (!sub) return null;
  const childId = sub.childThreadId;
  const openable = Boolean(childId && onOpenThread);
  const line = subagentLine(step);
  const label = SUBAGENT_LABELS[sub.state];
  const elapsed = elapsedLabel([step], now);
  const body = (
    <>
      <Avatar step={step} />
      <span className="subagent-text">
        <span className="subagent-title">{step.text}</span>
        <span className={`subagent-line${sub.state === "failed" ? " failed" : ""}`}>{line ?? label}</span>
      </span>
      <span className="subagent-side">
        {line && sub.state !== "completed" && <span className={`subagent-state ${subagentTone(step)}`}>{label}</span>}
        {elapsed && <span className="subagent-time">{elapsed}</span>}
        {openable && <Icon name="chevronRight" />}
      </span>
    </>
  );
  return (
    <div className="subagent-row">
      {openable ? (
        <Pressable className="subagent-row-main" aria-label={`Open ${step.text}`} onClick={() => onOpenThread!(childId!)}>
          {body}
        </Pressable>
      ) : (
        <div className="subagent-row-main">{body}</div>
      )}
      {sub.stoppable && (
        <IconButton
          label="Stop subagent"
          tooltip="Stop subagent"
          size="sm"
          variant="ghost"
          className="subagent-stop"
          disabled={stopping}
          aria-busy={stopping || undefined}
          onClick={() => void action.run(() => api.stopSubagent(threadId, sub.subagentId).finally(onChanged), setStopping)}
        >
          <Icon name="stop" />
        </IconButton>
      )}
    </div>
  );
}

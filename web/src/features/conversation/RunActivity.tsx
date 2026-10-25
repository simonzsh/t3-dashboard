import { useEffect, useRef, useState } from "react";
import type { ActivityItem, RunActivity } from "../../../../shared/api.ts";
import { STEP_LABELS, duration } from "../../lib/format.ts";
import { Button, Icon, Pressable, type IconName } from "../../ui/index.ts";

// Collapsed, a live run shows only its latest steps.
const PREVIEW_ITEMS = 4;

const ICONS: Record<ActivityItem["kind"], IconName> = { thinking: "thinking", command: "terminal", tool: "wrench", file: "edit", subagent: "bot" };

function Row({ item, onShowSubagents }: { item: ActivityItem; onShowSubagents: () => void }) {
  return (
    <li className={`activity-item ${item.kind} ${item.status}`}>
      <Icon name={ICONS[item.kind]} strokeWidth={1.8} label={STEP_LABELS[item.status]} />
      {item.kind === "subagent" ? (
        <Button variant="link" className="activity-text" title="Show in Subagents" onClick={onShowSubagents}>
          {item.text}
        </Button>
      ) : (
        <span className="activity-text" title={item.text}>
          {item.text}
          {item.detail && <span className="activity-detail"> {item.detail}</span>}
        </span>
      )}
    </li>
  );
}

interface Props {
  activity: RunActivity;
  /** The thread says a run is active: the activity may still be the previous run's. */
  running: boolean;
  onShowSubagents: () => void;
}

export function RunActivityView({ activity, running, onShowSubagents }: Props) {
  const live = running && activity.completedAt === null;
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => setOpen(false), [activity.runId]);

  // The list opens at the bottom of the scroller: bring it into view.
  useEffect(() => {
    if (open) list.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const end = live ? now : activity.completedAt ? Date.parse(activity.completedAt) : null;
  if (!activity.startedAt || end === null) return null;
  const label = `${live ? "Working" : "Worked"} for ${duration(end - Date.parse(activity.startedAt))}`;
  const shown = open ? activity.items : live ? activity.items.slice(-PREVIEW_ITEMS) : [];
  return (
    <div className={`activity${live ? " live" : ""}`}>
      <Pressable className="activity-head" aria-expanded={open} disabled={activity.items.length === 0} onClick={() => setOpen(!open)}>
        {label}
        {activity.items.length > 0 && <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />}
      </Pressable>
      {shown.length > 0 && (
        <ul className="activity-list" ref={list}>
          {shown.map((item) => (
            <Row key={item.id} item={item} onShowSubagents={onShowSubagents} />
          ))}
        </ul>
      )}
    </div>
  );
}

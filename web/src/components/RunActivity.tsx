import { useEffect, useRef, useState } from "react";
import type { ActivityItem, RunActivity } from "../../../shared/api.ts";
import { duration } from "../format.ts";
import { Button, Pressable } from "../ui/index.ts";

// Collapsed, a live run shows only its latest steps.
const PREVIEW_ITEMS = 4;
const STATUS_LABELS: Record<ActivityItem["status"], string> = { running: "Running", done: "Done", failed: "Failed" };

const ICONS: Record<ActivityItem["kind"], string> = {
  thinking:
    "M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0-1 5 3 3 0 0 0 2 5 3 3 0 0 0 5 1.5A2 2 0 0 0 12 18ZM12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 1 5 3 3 0 0 1-2 5 3 3 0 0 1-5 1.5 2 2 0 0 1-2-1.5ZM12 5v13",
  command: "m4 17 6-6-6-6M12 19h8",
  tool: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z",
  file: "M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z",
  subagent: "M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM2 14h2M20 14h2M15 13v2M9 13v2",
};

function Row({ item, onShowSubagents }: { item: ActivityItem; onShowSubagents: () => void }) {
  return (
    <li className={`activity-item ${item.kind} ${item.status}`}>
      <svg className="icon" viewBox="0 0 24 24" role="img" aria-label={STATUS_LABELS[item.status]}>
        <title>{STATUS_LABELS[item.status]}</title>
        <path d={ICONS[item.kind]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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

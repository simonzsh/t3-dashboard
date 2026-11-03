import { useEffect, useState } from "react";
import type { RunActivity } from "../../../../shared/api.ts";
import { duration } from "../../lib/format.ts";

interface Props {
  activity: RunActivity;
  /** The thread says a run is active: the activity may still be the previous run's. */
  running: boolean;
}

export function RunActivityView({ activity, running }: Props) {
  const live = running && activity.completedAt === null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const end = live ? now : activity.completedAt ? Date.parse(activity.completedAt) : null;
  if (!activity.startedAt || end === null) return null;
  const label = `${live ? "Working" : "Worked"} for ${duration(end - Date.parse(activity.startedAt))}`;
  return (
    <div className={`activity${live ? " live" : ""}`}>
      <span className="activity-head">{label}</span>
    </div>
  );
}

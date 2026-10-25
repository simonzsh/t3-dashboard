import { useEffect, useRef, useState } from "react";
import type { SubagentInfo } from "../../../../shared/api.ts";
import { duration } from "../../lib/format.ts";
import { Pressable } from "../../ui/index.ts";

const STATUS_LABELS: Record<SubagentInfo["status"], string> = { running: "Running", done: "Done", failed: "Failed" };

function elapsed(s: SubagentInfo, now: number): string | null {
  if (!s.startedAt) return null;
  const end = s.completedAt ? Date.parse(s.completedAt) : now;
  return duration(end - Date.parse(s.startedAt));
}

/** Each change of `reveal` opens the strip and focuses it (a subagent row of the run activity was clicked). */
export function SubagentStrip({ subagents, reveal = 0 }: { subagents: SubagentInfo[]; reveal?: number }) {
  const running = subagents.filter((s) => s.status === "running").length;
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const head = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reveal === 0) return;
    setOpen(true);
    head.current?.focus();
  }, [reveal]);

  const anyRunning = running > 0;
  useEffect(() => {
    if (anyRunning) setOpen(true);
  }, [anyRunning]);

  // Running durations tick every second.
  useEffect(() => {
    if (running === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (subagents.length === 0) return null;
  return (
    <div className="subagents">
      <Pressable ref={head} className="subagents-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />
        Subagents
        <span className="subagents-count">{running > 0 ? `${running} running` : subagents.length}</span>
      </Pressable>
      {open && (
        <ul className="subagent-list">
          {subagents.map((s) => {
            const detail = s.status === "running" ? s.progress : s.result;
            return (
              <li key={s.id} className={`subagent ${s.status}`}>
                <span className="subagent-dot" role="img" aria-label={STATUS_LABELS[s.status]} title={STATUS_LABELS[s.status]} />
                <span className="subagent-text">
                  <span className="subagent-title" title={s.title}>
                    {s.title}
                  </span>
                  {detail && (
                    <span className="subagent-detail" title={detail}>
                      {detail}
                    </span>
                  )}
                </span>
                <span className="subagent-time">{elapsed(s, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

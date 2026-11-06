import { memo, useRef } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { relativeTime } from "../../lib/format.ts";
import { threadTitle } from "../../lib/threads.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Pressable } from "../../ui/index.ts";
import { ThreadActions, flyToSessions, type ThreadActionsProps } from "./ThreadActions.tsx";

interface Props extends Omit<ThreadActionsProps, "thread" | "rowRef"> {
  thread: DashboardThread;
  project: DashboardProject | undefined;
  modelName: string | null;
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
}

/** A thread in the Running and Up next cards: title, then model, project and time. */
function ThreadRowView({ thread: t, project, modelName, now, onOpen, ...actions }: Props) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const working = agentStatus(t) === "working";
  return (
    <div className="run-item">
      <Pressable
        ref={rowRef}
        className={`run-row${working ? " working" : ""}`}
        onClick={(e) => {
          if (e.shiftKey) flyToSessions(rowRef.current, actions.inSessions);
          onOpen(t.id, e.shiftKey);
        }}
      >
        <span className="notif-title">{threadTitle(t)}</span>
        <span className="notif-meta">
          {modelName && (
            <>
              <ProviderIcon provider={t.provider} />
              {modelName} ·{" "}
            </>
          )}
          {[project?.title, relativeTime(t.lastActivityAt, now)].filter(Boolean).join(" · ")}
        </span>
      </Pressable>
      <ThreadActions thread={t} rowRef={rowRef} {...actions} />
    </div>
  );
}

export const ThreadRow = memo(ThreadRowView);

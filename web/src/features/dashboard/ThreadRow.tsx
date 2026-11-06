import { memo } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Pressable } from "../../ui/index.ts";
import { openRow, threadMeta } from "./threadRows.ts";

interface Props {
  thread: DashboardThread;
  project: DashboardProject | undefined;
  modelName: string | null;
  now: Date;
  inSessions: boolean;
  onOpen: (id: string, addOnly: boolean) => void;
}

/** A thread in the Running and Up next cards: title, then model, project and time. A click opens it in Sessions. */
function ThreadRowView({ thread: t, project, modelName, now, inSessions, onOpen }: Props) {
  const working = agentStatus(t) === "working";
  return (
    <div className="run-item">
      <Pressable className={`run-row${working ? " working" : ""}`} onClick={(e) => openRow(e, t.id, inSessions, onOpen)}>
        <span className="notif-title">{threadTitle(t)}</span>
        <span className="notif-meta">
          {modelName && (
            <>
              <ProviderIcon provider={t.provider} />
              {modelName} ·{" "}
            </>
          )}
          {threadMeta(t, project, now)}
        </span>
      </Pressable>
    </div>
  );
}

export const ThreadRow = memo(ThreadRowView);

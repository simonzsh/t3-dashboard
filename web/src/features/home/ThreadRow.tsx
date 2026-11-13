import { memo } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { Pressable, RunningDot } from "../../ui/index.ts";
import { openRow, threadAge } from "./threadRows.ts";

interface Props {
  thread: DashboardThread;
  project: DashboardProject | undefined;
  modelName: string | null;
  now: Date;
  inSessions: boolean;
  onOpen: (id: string, addOnly: boolean) => void;
}

/** A thread in the Running card: title, then age, project and model icon. A click opens it in Sessions. */
function ThreadRowView({ thread: t, project, modelName, now, inSessions, onOpen }: Props) {
  const working = agentStatus(t) === "working";
  return (
    <div className="run-item">
      <Pressable className="run-row" onClick={(e) => openRow(e, t.id, inSessions, onOpen)}>
        {working && <RunningDot className="run-pulse" label="Running" />}
        <span className="run-text">
          <span className="title-line">
            <span className="notif-title">{threadTitle(t)}</span>
            <AutomationMark id={t.id} />
          </span>
          <span className="notif-meta">
            <span className="notif-age">{threadAge(t, now)}</span>
            {project && <ProjectTag icon={project.icon} title={project.title} />}
            {modelName && (
              <span className="notif-end">
                <ProviderIcon provider={t.provider} />
              </span>
            )}
          </span>
        </span>
      </Pressable>
    </div>
  );
}

export const ThreadRow = memo(ThreadRowView);

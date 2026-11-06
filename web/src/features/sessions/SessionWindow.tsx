import { memo, type Dispatch } from "react";
import type { DashboardProvider, DashboardThread, ProjectIcon as ProjectIconData } from "../../../../shared/api.ts";
import { threadState, type ThreadState } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Badge, Button, Icon, IconButton } from "../../ui/index.ts";
import type { SessionsAction } from "./sessions.ts";
import { ConversationPanel } from "../conversation/ConversationPanel.tsx";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { ctrlLabel } from "../../lib/shortcuts.ts";

const STATE_LABELS: Record<ThreadState, string> = { waiting: "Waiting", running: "Running", done: "Done", error: "Error", idle: "Idle" };

interface Props {
  id: string;
  thread: DashboardThread | null;
  projectTitle: string | null;
  projectIcon: ProjectIconData | null;
  // The thread left the live state (archived or deleted) after this window saw it.
  missing: boolean;
  focused: boolean;
  maximized: boolean;
  compact: boolean;
  // False for a column far off screen: the header stays and the conversation is not mounted.
  live: boolean;
  t3EnvironmentId: string | null;
  providers: DashboardProvider[];
  // A subagent thread has no shell entry: the window takes its name from the conversation.
  childTitle?: string;
  onTitle?: (id: string, title: string) => void;
  // Stable across renders, so a window rerenders only when its own props change.
  dispatch: Dispatch<SessionsAction>;
}

function SessionWindowView({ id, thread, projectTitle, projectIcon, missing, focused, maximized, compact, live, t3EnvironmentId, providers, childTitle, onTitle, dispatch }: Props) {
  const onFocus = () => dispatch({ type: "focus", id });
  const onClose = () => dispatch({ type: "close", id });
  const onToggleMaximize = () => dispatch({ type: "maximize", id });
  const state = thread ? threadState(thread) : null;
  const title = thread || !childTitle ? threadTitle(thread) : childTitle;
  return (
    <section
      className={`session-window${state ? ` state-${state}` : ""}${focused ? " focused" : ""}${maximized ? " maximized" : ""}`}
      data-session-window={id}
      aria-label={title}
      onMouseDownCapture={() => {
        if (!focused) onFocus();
      }}
      onFocusCapture={() => {
        if (!focused) onFocus();
      }}
    >
      <header className="session-window-head">
        <div className="sc-row">
          {!compact && <Icon name="grip" className="icon sc-grip" />}
          <span className="dw-title" data-tooltip={title} data-tooltip-clipped>
            {title}
          </span>
          {state && (
            <Badge variant={state === "idle" ? "neutral" : state} className="dw-state">
              {STATE_LABELS[state]}
            </Badge>
          )}
          <span className="dw-buttons">
            <OpenInT3 environmentId={t3EnvironmentId} threadId={id} />
            {!compact && (
              <IconButton variant="ghost" size="sm" label={maximized ? "Exit fullscreen" : "Fullscreen"} tooltip={maximized ? "Exit fullscreen" : "Fullscreen"} shortcut={maximized ? `${ctrlLabel("F")} / Esc` : ctrlLabel("F")} onClick={onToggleMaximize}>
                <Icon name={maximized ? "exitFullscreen" : "fullscreen"} />
              </IconButton>
            )}
            <IconButton variant="ghost" size="sm" label="Close" tooltip="Close" shortcut={ctrlLabel("X")} onClick={onClose}>
              <Icon name="x" />
            </IconButton>
          </span>
        </div>
        {thread && projectTitle && (
          <div className="sc-sub">
            <ProjectIcon icon={projectIcon} title={projectTitle} />
            <span className="dw-project">{projectTitle}</span>
          </div>
        )}
      </header>
      {missing ? (
        <div className="sessions-missing">
          <span>This thread was archived or deleted.</span>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : !live ? (
        <div className="sessions-placeholder" />
      ) : (
        <ConversationPanel threadId={id} thread={thread} providers={providers} onOpenThread={(child) => dispatch({ type: "open", id: child })} onTitle={(name) => onTitle?.(id, name)} />
      )}
    </section>
  );
}

export const SessionWindow = memo(SessionWindowView);

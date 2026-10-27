import { memo, type Dispatch } from "react";
import type { DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import { threadState, type ThreadState } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Badge, Button, Icon, IconButton } from "../../ui/index.ts";
import type { DeskAction } from "./desk.ts";
import { ConversationPanel } from "../conversation/ConversationPanel.tsx";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";

const STATE_LABELS: Record<ThreadState, string> = { waiting: "Waiting", running: "Running", done: "Done", error: "Error", idle: "Idle" };

interface Props {
  id: string;
  thread: DashboardThread | null;
  projectTitle: string | null;
  // The thread left the live state (archived or deleted) after this window saw it.
  missing: boolean;
  focused: boolean;
  maximized: boolean;
  compact: boolean;
  t3EnvironmentId: string | null;
  providers: DashboardProvider[];
  // Stable across renders, so a window rerenders only when its own props change.
  dispatch: Dispatch<DeskAction>;
}

function DeskWindowView({ id, thread, projectTitle, missing, focused, maximized, compact, t3EnvironmentId, providers, dispatch }: Props) {
  const onFocus = () => dispatch({ type: "focus", id });
  const onClose = () => dispatch({ type: "close", id });
  const onMinimize = () => dispatch({ type: "minimize", id });
  const onToggleMaximize = () => dispatch({ type: "maximize", id });
  const state = thread ? threadState(thread) : null;
  const title = threadTitle(thread);
  return (
    <section
      className={`desk-window${state ? ` state-${state}` : ""}${focused ? " focused" : ""}${maximized ? " maximized" : ""}`}
      data-desk-window={id}
      aria-label={title}
      onMouseDownCapture={() => {
        if (!focused) onFocus();
      }}
      onFocusCapture={() => {
        if (!focused) onFocus();
      }}
    >
      <header className="desk-window-head">
        {thread && <ProviderIcon provider={thread.provider} />}
        <span className="dw-title" data-tooltip={title} data-tooltip-clipped>
          {title}
        </span>
        {projectTitle && <span className="dw-project">{projectTitle}</span>}
        {state && (
          <Badge variant={state === "idle" ? "neutral" : state} className="dw-state">
            {STATE_LABELS[state]}
          </Badge>
        )}
        <span className="dw-buttons">
          <OpenInT3 environmentId={t3EnvironmentId} threadId={id} />
          {!compact && (
            <>
              <IconButton variant="ghost" size="sm" label={maximized ? "Exit fullscreen" : "Fullscreen"} tooltip={maximized ? "Exit fullscreen" : "Fullscreen"} shortcut={maximized ? "F / Esc" : "F"} onClick={onToggleMaximize}>
                <Icon name={maximized ? "exitFullscreen" : "fullscreen"} />
              </IconButton>
              <IconButton variant="ghost" size="sm" label="Minimize" tooltip="Minimize" shortcut="M" onClick={onMinimize}>
                <Icon name="minimize" />
              </IconButton>
            </>
          )}
          <IconButton variant="ghost" size="sm" label="Close" tooltip="Close" shortcut="X" onClick={onClose}>
            <Icon name="x" />
          </IconButton>
        </span>
      </header>
      {missing ? (
        <div className="desk-missing">
          <span>This thread was archived or deleted.</span>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <ConversationPanel threadId={id} thread={thread} providers={providers} />
      )}
    </section>
  );
}

export const DeskWindow = memo(DeskWindowView);

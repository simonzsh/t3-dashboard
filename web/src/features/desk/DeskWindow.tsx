import type { DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import { threadState, type ThreadState } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Badge, Button, Icon, Pressable } from "../../ui/index.ts";
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
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

export function DeskWindow({ id, thread, projectTitle, missing, focused, maximized, compact, t3EnvironmentId, providers, onFocus, onClose, onMinimize, onToggleMaximize }: Props) {
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
        <span className="dw-title" title={title}>
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
          <span className="traffic">
            <Pressable className="light close" aria-label="Close" title="Close (X)" onClick={onClose}>
              <Icon name="x" strokeWidth={1.8} />
            </Pressable>
            {!compact && (
              <>
                <Pressable className="light minimize" aria-label="Minimize" title="Minimize (M)" onClick={onMinimize}>
                  <Icon name="minus" strokeWidth={1.8} />
                </Pressable>
                <Pressable className="light fullscreen" aria-label={maximized ? "Exit fullscreen" : "Fullscreen"} title={maximized ? "Exit fullscreen (F, Esc)" : "Fullscreen (F)"} onClick={onToggleMaximize}>
                  <Icon name={maximized ? "restore" : "maximize"} strokeWidth={1.8} />
                </Pressable>
              </>
            )}
          </span>
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

import type { DashboardEvent, DashboardProvider, DashboardThread } from "../../../shared/api.ts";
import { threadState, type ThreadState } from "../agents.ts";
import { ConversationPanel } from "./ConversationPanel.tsx";
import { OpenInT3 } from "./OpenInT3.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";

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
  lastEvent: DashboardEvent | null;
  t3EnvironmentId: string | null;
  providers: DashboardProvider[];
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

const Icon = ({ d }: { d: string }) => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function DeskWindow({ id, thread, projectTitle, missing, focused, maximized, compact, lastEvent, t3EnvironmentId, providers, onFocus, onClose, onMinimize, onToggleMaximize }: Props) {
  const state = thread ? threadState(thread) : null;
  const title = thread?.title || "(untitled)";
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
        {state && <span className={`dw-state ${state}`}>{STATE_LABELS[state]}</span>}
        <span className="dw-buttons">
          <OpenInT3 environmentId={t3EnvironmentId} threadId={id} />
          {!compact && (
            <>
              <button className="icon-button" aria-label={maximized ? "Exit fullscreen" : "Fullscreen"} title={maximized ? "Exit fullscreen (F, Esc)" : "Fullscreen (F)"} onClick={onToggleMaximize}>
                <Icon d={maximized ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
              </button>
              <button className="icon-button" aria-label="Minimize" title="Minimize (M)" onClick={onMinimize}>
                <Icon d="M6 18h12" />
              </button>
            </>
          )}
          <button className="icon-button" aria-label="Close" title="Close (X)" onClick={onClose}>
            <Icon d="M6 6l12 12M18 6L6 18" />
          </button>
        </span>
      </header>
      {missing ? (
        <div className="desk-missing">
          <span>This thread was archived or deleted.</span>
          <button onClick={onClose}>Close</button>
        </div>
      ) : (
        <ConversationPanel threadId={id} thread={thread} lastEvent={lastEvent} providers={providers} />
      )}
    </section>
  );
}

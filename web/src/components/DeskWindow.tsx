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
          <span className="traffic">
            <button className="light close" aria-label="Close" title="Close (X)" onClick={onClose}>
              <Icon d="M7 7l10 10M17 7L7 17" />
            </button>
            {!compact && (
              <>
                <button className="light minimize" aria-label="Minimize" title="Minimize (M)" onClick={onMinimize}>
                  <Icon d="M6 12h12" />
                </button>
                <button className="light fullscreen" aria-label={maximized ? "Exit fullscreen" : "Fullscreen"} title={maximized ? "Exit fullscreen (F, Esc)" : "Fullscreen (F)"} onClick={onToggleMaximize}>
                  <Icon d={maximized ? "M10 6v4H6M14 18v-4h4" : "M7 13V7h6M17 11v6h-6"} />
                </button>
              </>
            )}
          </span>
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

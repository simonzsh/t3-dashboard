import { memo, type Dispatch } from "react";
import type { DashboardProvider, DashboardThread, ProjectIcon as ProjectIconData, ThreadPullRequest } from "../../../../shared/api.ts";
import { ActionMenu, Badge, Button, Icon, IconButton, IconButtonLink } from "../../ui/index.ts";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { attentionState } from "./sessionList.ts";
import type { SessionsAction } from "./sessions.ts";
import { ConversationPanel } from "../conversation/ConversationPanel.tsx";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { RunningBadge } from "../../lib/StatusBadge.tsx";
import { ctrlLabel } from "../../lib/shortcuts.ts";
import { hashForPr } from "../../lib/tabs.ts";

// Only the states that ask for attention get a badge: a done or idle session shows none.
const STATE_LABELS = { waiting: "Waiting", error: "Error" } as const;

interface Props {
  id: string;
  thread: DashboardThread | null;
  // A subagent thread has no shell entry: its name comes from the conversation.
  title: string;
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
  onTitle?: (id: string, title: string) => void;
  /** On a phone: the arrow back to the list. */
  onBack?: () => void;
  // Stable across renders, so a window rerenders only when its own props change.
  dispatch: Dispatch<SessionsAction>;
}

function SessionWindowView({ id, thread, title, projectTitle, projectIcon, missing, focused, maximized, compact, live, t3EnvironmentId, providers, onTitle, onBack, dispatch }: Props) {
  const onFocus = () => dispatch({ type: "focus", id });
  const onClose = () => dispatch({ type: "close", id });
  const onToggleMaximize = () => dispatch({ type: "maximize", id });
  const fullscreen = maximized ? "Exit fullscreen" : "Fullscreen";
  const badge = thread ? attentionState(thread) : null;
  return (
    <section
      className={`session-window${focused ? " focused" : ""}${maximized ? " maximized" : ""}`}
      data-session-window={id}
      aria-label={title}
      onFocusCapture={() => {
        if (!focused) onFocus();
      }}
    >
      <header className="session-window-head">
        <div className="session-window-row">
          {!compact && <Icon name="grip" className="icon session-window-grip" />}
          {onBack && (
            <IconButton variant="ghost" size="sm" className="session-window-back" label="Back to the list" onClick={onBack}>
              <Icon name="arrowLeft" />
            </IconButton>
          )}
          <span className="session-window-title" data-tooltip={title} data-tooltip-clipped>
            {title}
          </span>
          <AutomationMark id={id} />
          {badge === "running" ? (
            <RunningBadge className="session-window-state" />
          ) : (
            badge && (
              <Badge variant={badge} className="session-window-state">
                {STATE_LABELS[badge]}
              </Badge>
            )
          )}
          <span className="session-window-buttons">
            {thread && <PullRequestsButton pullRequests={thread.pullRequests} />}
            <OpenInT3 environmentId={t3EnvironmentId} threadId={id} />
            {!compact && (
              <IconButton variant="ghost" size="sm" label={fullscreen} tooltip={fullscreen} shortcut={maximized ? `${ctrlLabel("F")} / Esc` : ctrlLabel("F")} onClick={onToggleMaximize}>
                <Icon name={maximized ? "exitFullscreen" : "fullscreen"} />
              </IconButton>
            )}
            <IconButton variant="ghost" size="sm" label="Close" tooltip="Close" shortcut={ctrlLabel("X")} onClick={onClose}>
              <Icon name="x" />
            </IconButton>
          </span>
        </div>
        {thread && projectTitle && (
          <div className="session-window-sub">
            <ProjectIcon icon={projectIcon} title={projectTitle} />
            <span className="session-window-project">{projectTitle}</span>
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


/** One pull request: a direct link to its diff. Several (a stack, say): a menu with one link each. */
export function PullRequestsButton({ pullRequests }: { pullRequests: ThreadPullRequest[] }) {
  const [first] = pullRequests;
  if (!first) return null;
  if (pullRequests.length === 1) {
    const label = `Open pull request #${first.number}`;
    return (
      <IconButtonLink variant="ghost" size="sm" href={hashForPr(first)} label={label} tooltip={label}>
        <Icon name="gitPullRequest" />
      </IconButtonLink>
    );
  }
  const items = pullRequests.map((pr) => ({
    label: `#${pr.number} ${pr.repository}${pr.title ? ` – ${pr.title}` : ""}`,
    icon: "gitPullRequest" as const,
    onSelect: () => (window.location.hash = hashForPr(pr)),
  }));
  return <ActionMenu label={`${pullRequests.length} pull requests`} tooltip="Pull requests" icon="gitPullRequest" count={pullRequests.length} items={items} />;
}

export const SessionWindow = memo(SessionWindowView);

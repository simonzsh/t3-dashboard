import { memo, type Dispatch } from "react";
import type { DashboardProvider, DashboardThread, ProjectIcon as ProjectIconData, ThreadPullRequest } from "../../../../shared/api.ts";
import { ActionMenu, Badge, Button, Icon, IconButton, IconButtonLink } from "../../ui/index.ts";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { attentionState } from "./sessionList.ts";
import type { AlertMode, SessionsAction } from "./sessions.ts";
import { ConversationPanel } from "../conversation/ConversationPanel.tsx";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { RunningBadge } from "../../lib/StatusBadge.tsx";
import { ctrlLabel } from "../../lib/shortcuts.ts";
import { newestFirst, prMarkId, type OpenPrs } from "../../lib/prSeen.ts";
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
  /** The open pull requests (creation time, unread). Keyed on content in App, so a window does not rerender at each read. */
  openPrs: OpenPrs;
  onTitle?: (id: string, title: string) => void;
  /** On a phone: the arrow back to the list. */
  onBack?: () => void;
  /** The phone alert bell: null when alerts are not set up. */
  alert: AlertMode | null;
  onToggleAlert: (id: string) => void;
  // Stable across renders, so a window rerenders only when its own props change.
  dispatch: Dispatch<SessionsAction>;
}

function SessionWindowView({ id, thread, title, projectTitle, projectIcon, missing, focused, maximized, compact, live, t3EnvironmentId, providers, openPrs, onTitle, onBack, alert, onToggleAlert, dispatch }: Props) {
  const onFocus = () => dispatch({ type: "focus", id });
  const onClose = () => dispatch({ type: "close", id });
  const onToggleMaximize = () => dispatch({ type: "maximize", id });
  const fullscreen = maximized ? "Exit fullscreen" : "Fullscreen";
  const alertLabel = alert === "armed" ? "Alert on: click to turn off" : "Alert me on my phone";
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
        <div className="session-window-sub">
          {thread && projectTitle && (
            <>
              <ProjectIcon icon={projectIcon} title={projectTitle} />
              <span className="session-window-project">{projectTitle}</span>
            </>
          )}
          <span className="session-window-buttons">
            {alert && (
              <IconButton variant="ghost" size="sm" label={alertLabel} tooltip={alertLabel} aria-pressed={alert === "armed"} onClick={() => onToggleAlert(id)}>
                <Icon name={alert === "armed" ? "bellRing" : "bell"} />
              </IconButton>
            )}
            {thread && <PullRequestsButton fromSession={thread.id} pullRequests={thread.pullRequests} open={openPrs} />}
            <OpenInT3 environmentId={t3EnvironmentId} threadId={id} />
          </span>
        </div>
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


/** One pull request: a direct link to its diff. Several (a stack, say): a menu with one link each, newest first. */
export function PullRequestsButton({ pullRequests, open, fromSession }: { fromSession?: string; pullRequests: ThreadPullRequest[]; open: OpenPrs }) {
  const [first] = pullRequests;
  if (!first) return null;
  const unread = (pr: ThreadPullRequest) => open.get(prMarkId(pr))?.unread ?? false;
  if (pullRequests.length === 1) {
    const label = `Open pull request #${first.number}`;
    return (
      <IconButtonLink variant="ghost" size="sm" href={hashForPr(first, fromSession)} label={unread(first) ? `${label} (unread)` : label} tooltip={label}>
        <Icon name="gitPullRequest" />
        {unread(first) && <span className="notif-dot icon-button-dot" aria-hidden="true" />}
      </IconButtonLink>
    );
  }
  const items = newestFirst(pullRequests, open).map((pr) => ({
    label: `#${pr.number} ${pr.repository}`,
    detail: pr.title || undefined,
    icon: "gitPullRequest" as const,
    onSelect: () => (window.location.hash = hashForPr(pr, fromSession)),
    unread: unread(pr),
  }));
  // The badge counts the rows with the unread ring, so it goes away once they are all read.
  const unreadCount = items.filter((item) => item.unread).length;
  const label = `${pullRequests.length} pull requests${unreadCount ? `, ${unreadCount} unread` : ""}`;
  return <ActionMenu label={label} tooltip="Pull requests" icon="gitPullRequest" count={unreadCount} items={items} />;
}

export const SessionWindow = memo(SessionWindowView);

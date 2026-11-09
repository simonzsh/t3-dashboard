import { Fragment, type ReactNode } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrDetail, PrRef } from "../../../../shared/pulls.ts";
import { relativeTime } from "../../lib/format.ts";
import { ActionMenu, Badge, Button, ButtonLink, Icon, IconButton, IconButtonLink, SidePanelToggle, type ActionMenuItem } from "../../ui/index.ts";
import { Counts } from "./DiffFiles.tsx";
import { StatusButton } from "./PrChecks.tsx";
import { SessionsButton } from "./SessionsButton.tsx";
import { isWebUrl } from "./pulls.ts";

import { prStatus } from "../../lib/prStatus.ts";

/** What the collapse controls offer next, and their actions. */
export interface DiffControls {
  hasFiles: boolean;
  hasTests: boolean;
  anyOpen: boolean;
  testsOpen: boolean;
  toggleAll: () => void;
  toggleTests: () => void;
}

interface Props {
  sourceSession?: DashboardThread;
  pr: PrRef;
  detail: PrDetail | null;
  now: Date;
  sessions: DashboardThread[];
  onOpenSession: (id: string, addOnly: boolean) => void;
  controls: DiffControls;
  refreshing: boolean;
  onRefresh: () => void;
  /** Wide screen: the panel button of the side file tree, as on Sessions. */
  filesPanel?: { hidden: boolean; onToggle: () => void };
  /** Narrow screen: opens the file tree in a sheet. */
  onShowFiles?: () => void;
  /** On a phone the actions go in one menu, and the meta line scrolls with the diff. */
  phone: boolean;
  /** The tab list of the page, under the title and meta lines. */
  tabs?: ReactNode;
}

/** Repository, author, branches and age, then the state, checks, review and size. */
export function PrMeta({ detail, now }: { detail: PrDetail; now: Date }) {
  const status = prStatus(detail);
  return (
    <div className="pulls-head-meta">
      <p className="pulls-meta">
        {detail.repository} · {detail.author} · <code>{detail.headRef}</code> → <code>{detail.baseRef}</code> · updated {relativeTime(detail.updatedAt, now)}
      </p>
      <div className="pulls-badges">
        <Badge className={`pr-state-badge ${status.className}`}><Icon name={status.icon} />{status.label}</Badge>
        <StatusButton detail={detail} />
        <Counts additions={detail.additions} deletions={detail.deletions} />
        <span className="pulls-files">{detail.changedFiles} files</span>
      </div>
    </div>
  );
}

// The diff actions, once: icon buttons on a wide screen, rows of the "…" menu on a phone. Refresh is last.
function diffActions({ controls, refreshing, onRefresh, onShowFiles }: Props): ActionMenuItem[] {
  const items: ActionMenuItem[] = [];
  if (controls.hasFiles) items.push({ label: controls.anyOpen ? "Collapse all" : "Expand all", icon: controls.anyOpen ? "chevronsDownUp" : "chevronsUpDown", onSelect: controls.toggleAll });
  if (controls.hasTests) items.push({ label: controls.testsOpen ? "Collapse tests" : "Expand tests", icon: controls.testsOpen ? "flaskConicalOff" : "flaskConical", onSelect: controls.toggleTests });
  if (onShowFiles && controls.hasFiles) items.push({ label: "Changed files", icon: "listTree", onSelect: onShowFiles });
  items.push({ label: "Refresh", icon: "refresh", disabled: refreshing, onSelect: onRefresh });
  return items;
}

function menuItems(props: Props): ActionMenuItem[] {
  const { detail, sessions, onOpenSession } = props;
  const items: ActionMenuItem[] = [];
  if (detail && isWebUrl(detail.url)) items.push({ label: "Open on GitHub", icon: "github", onSelect: () => window.open(detail.url, "_blank", "noopener,noreferrer") });
  for (const thread of sessions) items.push({ label: sessions.length === 1 ? "Open session" : thread.title, icon: "messagesSquare", onSelect: () => onOpenSession(thread.id, false) });
  return [...items, ...diffActions(props)];
}

/** The pull request header: it sits above the scroll box, so the title and actions never leave the screen. */
export function PrHeader(props: Props) {
  const { pr, detail, now, sessions, onOpenSession, controls, refreshing, filesPanel, phone, tabs } = props;
  const title = detail?.title ?? `${pr.repository}#${pr.number}`;
  return (
    <header className="pulls-head">
      <div className="pulls-head-row">
        {props.sourceSession ? (phone ? (
          <IconButton variant="ghost" size="sm" className="pulls-back" label="Back to session" onClick={() => onOpenSession(props.sourceSession!.id, false)}>
            <Icon name="arrowLeft" />
          </IconButton>
        ) : (
          <Button variant="ghost" size="sm" className="pulls-back" tooltip={props.sourceSession.title} onClick={() => onOpenSession(props.sourceSession!.id, false)}>
            <Icon name="arrowLeft" /> Back to session
          </Button>
        )) : (
          <IconButtonLink variant="ghost" size="sm" href="#/pulls" label="Back to pull requests" className="pulls-back">
            <Icon name="arrowLeft" />
          </IconButtonLink>
        )}
        <h2 className="pulls-title">
          {title} {detail && <span className="pulls-num">#{detail.number}</span>}
        </h2>
        <div className="pulls-head-actions">
          {phone ? (
            <ActionMenu label="Pull request actions" items={menuItems(props)} />
          ) : (
            <>
              {detail && isWebUrl(detail.url) && (
                <ButtonLink size="sm" href={detail.url} target="_blank" rel="noreferrer noopener">
                  <Icon name="github" /> Open on GitHub
                </ButtonLink>
              )}
              <SessionsButton sessions={sessions} text="Open session" variant="secondary" onOpenThread={onOpenSession} />
              {diffActions(props).map((action) => (
                <Fragment key={action.label}>
                  {/* The panel toggle sits just before Refresh, the last action. */}
                  {action.icon === "refresh" && filesPanel && controls.hasFiles && <SidePanelToggle size="sm" hidden={filesPanel.hidden} show="Show files" hide="Hide files" onToggle={filesPanel.onToggle} />}
                  <IconButton size="sm" variant="ghost" label={action.label} tooltip={action.label} disabled={action.disabled} onClick={action.onSelect}>
                    <Icon name={action.icon} className={action.icon === "refresh" && refreshing ? "icon spinning" : "icon"} />
                  </IconButton>
                </Fragment>
              ))}
            </>
          )}
        </div>
      </div>
      {detail && !phone && <PrMeta detail={detail} now={now} />}
      {tabs}
    </header>
  );
}

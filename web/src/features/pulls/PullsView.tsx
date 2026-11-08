import { useEffect, useMemo, useState } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrList, PrRef, PrSummary } from "../../../../shared/pulls.ts";
import { relativeTime } from "../../lib/format.ts";
import { prMark, prMarkId, unreadPrCount, type OpenPrs } from "../../lib/prSeen.ts";
import { hashForPr } from "../../lib/tabs.ts";
import { Badge, Dropdown, Icon, IconButton, ListPage, Loader, SearchField, Segmented } from "../../ui/index.ts";
import { ALL_REPOSITORIES, CHECKS, filterPrs, groupByRepository, repositoriesOf, REVIEWS, SCOPES, sessionsOf, shortRepository } from "./pulls.ts";
import { usePullsPrefs } from "./prefs.ts";
import { Counts } from "./DiffFiles.tsx";
import { PrDetail } from "./PrDetail.tsx";
import { SessionsButton } from "./SessionsButton.tsx";
import type { PullsState } from "./usePulls.ts";
import { usePrDetail } from "./usePrDetail.ts";

interface Props {
  /** The pull request in the address bar; null shows the list. */
  route: PrRef | null;
  threads: DashboardThread[];
  now: Date;
  /** Opens a thread in Sessions; `addOnly` adds it next to the open ones. */
  onOpenThread: (id: string, addOnly: boolean) => void;
  /** The list lives in App: it also feeds the unread badge and the session menus. */
  pulls: PullsState;
  /** Marks a pull request as read in the shared seen state. */
  onRead: (mark: { id: string; at: string }) => void;
  /** The open pull requests by `prMarkId`, with their unread state. */
  openPrs: OpenPrs;
}

function Row({ pr, unread, sessions, now, onOpenThread }: { pr: PrSummary; unread: boolean; sessions: DashboardThread[]; now: Date; onOpenThread: Props["onOpenThread"] }) {
  const checks = CHECKS[pr.checks];
  const review = REVIEWS[pr.review];
  return (
    <li className="pulls-row">
      <a className="pulls-row-main" href={hashForPr(pr)}>
        <span className="pulls-row-title">
          {pr.title}
          {unread && <span className="notif-dot" role="img" aria-label="Unread" />}
        </span>
        <span className="pulls-row-meta">
          #{pr.number} · {pr.author} · {pr.headRef} · {relativeTime(pr.updatedAt, now)}
        </span>
        <span className="pulls-badges">
          {pr.draft && <Badge>Draft</Badge>}
          {checks && <Badge variant={checks.variant}>{checks.label}</Badge>}
          {review && <Badge variant={review.variant}>{review.label}</Badge>}
          <Counts additions={pr.additions} deletions={pr.deletions} />
        </span>
      </a>
      <SessionsButton sessions={sessions} text="Session" className="pulls-row-session" onOpenThread={onOpenThread} />
    </li>
  );
}

interface ListProps extends Omit<Props, "route" | "pulls" | "onRead"> {
  list: PrList | null;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

export function PrListView({ list, error, refreshing, onRefresh, threads, now, onOpenThread, openPrs }: ListProps) {
  const [{ scope, repository }, setPrefs] = usePullsPrefs();
  const [query, setQuery] = useState("");
  const repositories = useMemo(() => repositoriesOf(list?.prs ?? []), [list]);
  // A repository that left the list (its last PR merged) must not leave an empty view behind.
  const repo = repositories.includes(repository) ? repository : ALL_REPOSITORIES;
  const isUnread = (pr: PrSummary) => openPrs.get(prMarkId(pr))?.unread ?? false;
  const groups = useMemo(() => groupByRepository(filterPrs(list?.prs ?? [], scope, repo, query, isUnread)), [list, scope, repo, query, openPrs]);
  const unread = unreadPrCount(openPrs);

  if (!list) return error ? <p className="auto-error" role="alert">{error}</p> : <Loader />;
  return (
    <ListPage
      className="pulls-list"
      aria-label="Pull requests"
      head={
        <div className="auto-toolbar">
          <SearchField className="auto-search" aria-label="Search pull requests" placeholder="Search pull requests…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Segmented label="Show" value={scope} options={SCOPES.map((s) => (s.id === "unread" && unread > 0 ? { ...s, label: `Unread ${unread}` } : s))} onChange={(scope) => setPrefs({ scope })} />
          <Dropdown
            label="Repository"
            value={repo}
            options={[{ id: ALL_REPOSITORIES, label: "All repositories" }, ...repositories.map((r) => ({ id: r, label: r }))]}
            onPick={(repository) => setPrefs({ repository })}
          />
          <IconButton variant="ghost" className="pulls-refresh" label="Refresh the list" tooltip="Refresh the list" disabled={refreshing} onClick={onRefresh}>
            <Icon name="refresh" />
          </IconButton>
        </div>
      }
    >
      {error && <p className="auto-error" role="alert">{error}</p>}
      {groups.length === 0 ? (
        <div className="empty-state">
          <Icon name="gitPullRequest" />
          <strong>{scope === "unread" && query === "" ? "All caught up" : "No open pull requests"}</strong>
          <span>{list.prs.length === 0 ? "Pull requests you open, or that wait for your review, show here." : scope === "unread" && query === "" ? "New pull requests you have not opened show here." : "None matches this search or these filters."}</span>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.repository} className="pulls-group">
            <h2 className="pulls-group-name" aria-label={group.repository}>
              <Icon name="gitBranch" /> {shortRepository(group.repository)} <span className="pulls-group-owner">{group.repository.split("/")[0]}</span>
            </h2>
            <ul className="pulls-rows">
              {group.prs.map((pr) => (
                <Row key={pr.number} pr={pr} unread={isUnread(pr)} sessions={sessionsOf(threads, pr)} now={now} onOpenThread={onOpenThread} />
              ))}
            </ul>
          </div>
        ))
      )}
    </ListPage>
  );
}

function List({ pulls, threads, now, onOpenThread, openPrs }: Omit<Props, "route" | "onRead">) {
  const { refresh, ...state } = pulls;
  return <PrListView {...state} threads={threads} now={now} onOpenThread={onOpenThread} openPrs={openPrs} onRefresh={() => void refresh()} />;
}

function Detail({ route, threads, now, onOpenThread, pulls, onRead }: Props & { route: PrRef }) {
  const summary = pulls.list?.prs.find((pr) => prMarkId(pr) === prMarkId(route));
  const { refresh, ...state } = usePrDetail(route, summary);
  // The detail may come before the list (a shared link): the list has the time when it loaded first.
  const known = state.detail ?? summary;
  const mark = known ? prMark(known) : null;
  useEffect(() => {
    if (mark) onRead(mark);
  }, [mark?.id, mark?.at, onRead]);
  return <PrDetail pr={route} {...state} onRefresh={() => void refresh()} now={now} sessions={sessionsOf(threads, route)} onOpenSession={onOpenThread} />;
}

/** The Pull requests page: your open pull requests, and one pull request's diff. */
export function PullsView({ route, ...rest }: Props) {
  return <div className="pulls-page">{route ? <Detail key={`${route.repository}#${route.number}`} route={route} {...rest} /> : <List {...rest} />}</div>;
}

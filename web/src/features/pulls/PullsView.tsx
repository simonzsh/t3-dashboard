import { useMemo, useState } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrList, PrRef, PrSummary } from "../../../../shared/pulls.ts";
import { relativeTime } from "../../lib/format.ts";
import { hashForPr } from "../../lib/tabs.ts";
import { Badge, Dropdown, Icon, IconButton, ListPage, Loader, SearchField, Segmented } from "../../ui/index.ts";
import { ALL_REPOSITORIES, CHECKS, filterPrs, groupByRepository, repositoriesOf, REVIEWS, SCOPES, sessionsOf, shortRepository } from "./pulls.ts";
import { usePullsPrefs } from "./prefs.ts";
import { Counts } from "./DiffFiles.tsx";
import { PrDetail } from "./PrDetail.tsx";
import { SessionsButton } from "./SessionsButton.tsx";
import { usePulls } from "./usePulls.ts";
import { usePrDetail } from "./usePrDetail.ts";

interface Props {
  /** The pull request in the address bar; null shows the list. */
  route: PrRef | null;
  threads: DashboardThread[];
  now: Date;
  /** Opens a thread in Sessions; `addOnly` adds it next to the open ones. */
  onOpenThread: (id: string, addOnly: boolean) => void;
}

function Row({ pr, sessions, now, onOpenThread }: { pr: PrSummary; sessions: DashboardThread[]; now: Date; onOpenThread: Props["onOpenThread"] }) {
  const checks = CHECKS[pr.checks];
  const review = REVIEWS[pr.review];
  return (
    <li className="pulls-row">
      <a className="pulls-row-main" href={hashForPr(pr)}>
        <span className="pulls-row-title">{pr.title}</span>
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

interface ListProps extends Omit<Props, "route"> {
  list: PrList | null;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

export function PrListView({ list, error, refreshing, onRefresh, threads, now, onOpenThread }: ListProps) {
  const [{ scope, repository }, setPrefs] = usePullsPrefs();
  const [query, setQuery] = useState("");
  const repositories = useMemo(() => repositoriesOf(list?.prs ?? []), [list]);
  // A repository that left the list (its last PR merged) must not leave an empty view behind.
  const repo = repositories.includes(repository) ? repository : ALL_REPOSITORIES;
  const groups = useMemo(() => groupByRepository(filterPrs(list?.prs ?? [], scope, repo, query)), [list, scope, repo, query]);

  if (!list) return error ? <p className="auto-error" role="alert">{error}</p> : <Loader />;
  return (
    <ListPage
      className="pulls-list"
      aria-label="Pull requests"
      head={
        <div className="pulls-tools">
          <div className="pulls-search-row">
            <SearchField className="pulls-search" aria-label="Search pull requests" placeholder="Search pull requests…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <IconButton variant="ghost" label="Refresh the list" tooltip="Refresh the list" disabled={refreshing} onClick={onRefresh}>
              <Icon name="refresh" />
            </IconButton>
          </div>
          <div className="pulls-filters">
            <Segmented label="Show" value={scope} options={SCOPES} onChange={(scope) => setPrefs({ scope })} />
            <Dropdown
              label="Repository"
              value={repo}
              options={[{ id: ALL_REPOSITORIES, label: "All repositories" }, ...repositories.map((r) => ({ id: r, label: r }))]}
              onPick={(repository) => setPrefs({ repository })}
            />
          </div>
        </div>
      }
    >
      {error && <p className="auto-error" role="alert">{error}</p>}
      {groups.length === 0 ? (
        <div className="empty-state">
          <Icon name="gitPullRequest" />
          <strong>No open pull requests</strong>
          <span>{list.prs.length === 0 ? "Pull requests you open, or that wait for your review, show here." : "None matches this search or these filters."}</span>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.repository} className="pulls-group">
            <h2 className="pulls-group-name" aria-label={group.repository}>
              <Icon name="gitBranch" /> {shortRepository(group.repository)} <span className="pulls-group-owner">{group.repository.split("/")[0]}</span>
            </h2>
            <ul className="pulls-rows">
              {group.prs.map((pr) => (
                <Row key={pr.number} pr={pr} sessions={sessionsOf(threads, pr)} now={now} onOpenThread={onOpenThread} />
              ))}
            </ul>
          </div>
        ))
      )}
    </ListPage>
  );
}

function List(props: Omit<Props, "route">) {
  const { refresh, ...state } = usePulls();
  return <PrListView {...state} {...props} onRefresh={() => void refresh()} />;
}

function Detail({ route, threads, now, onOpenThread }: Props & { route: PrRef }) {
  const { refresh, ...state } = usePrDetail(route);
  return <PrDetail pr={route} {...state} onRefresh={() => void refresh()} now={now} sessions={sessionsOf(threads, route)} onOpenSession={onOpenThread} />;
}

/** The Pull requests page: your open pull requests, and one pull request's diff. */
export function PullsView({ route, ...rest }: Props) {
  return <div className="pulls-page">{route ? <Detail key={`${route.repository}#${route.number}`} route={route} {...rest} /> : <List {...rest} />}</div>;
}

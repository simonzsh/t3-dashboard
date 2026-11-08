import { useMemo, useState } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrList, PrRef, PrSummary } from "../../../../shared/git.ts";
import { relativeTime } from "../../lib/format.ts";
import { hashForPr } from "../../lib/tabs.ts";
import { Badge, Button, Dropdown, Icon, IconButton, ListPage, Loader, SearchField, Segmented } from "../../ui/index.ts";
import { ALL_REPOSITORIES, CHECKS, filterPrs, groupByRepository, repositoriesOf, REVIEWS, SCOPES, sessionOf, shortRepository, type Scope } from "./git.ts";
import { Counts } from "./DiffFiles.tsx";
import { PrDetail } from "./PrDetail.tsx";
import { useGitPrs } from "./useGitPrs.ts";
import { usePrDetail } from "./usePrDetail.ts";

interface Props {
  /** The pull request in the address bar; null shows the list. */
  route: PrRef | null;
  threads: DashboardThread[];
  now: Date;
  /** Opens a thread in Sessions; `addOnly` adds it next to the open ones. */
  onOpenThread: (id: string, addOnly: boolean) => void;
}

function Row({ pr, session, now, onOpenThread }: { pr: PrSummary; session: DashboardThread | null; now: Date; onOpenThread: Props["onOpenThread"] }) {
  const checks = CHECKS[pr.checks];
  const review = REVIEWS[pr.review];
  return (
    <li className="git-row">
      <a className="git-row-main" href={hashForPr(pr)}>
        <span className="git-row-title">{pr.title}</span>
        <span className="git-row-meta">
          #{pr.number} · {pr.author} · {pr.headRef} · {relativeTime(pr.updatedAt, now)}
        </span>
        <span className="git-badges">
          {pr.draft && <Badge>Draft</Badge>}
          {checks && <Badge variant={checks.variant}>{checks.label}</Badge>}
          {review && <Badge variant={review.variant}>{review.label}</Badge>}
          <Counts additions={pr.additions} deletions={pr.deletions} />
        </span>
      </a>
      {session && (
        <Button size="sm" variant="ghost" className="git-row-session" onClick={(e) => onOpenThread(session.id, e.shiftKey)}>
          <Icon name="messagesSquare" /> Session
        </Button>
      )}
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
  const [scope, setScope] = useState<Scope>("all");
  const [repository, setRepository] = useState(ALL_REPOSITORIES);
  const [query, setQuery] = useState("");
  const repositories = useMemo(() => repositoriesOf(list?.prs ?? []), [list]);
  // A repository that left the list (its last PR merged) must not leave an empty view behind.
  const repo = repositories.includes(repository) ? repository : ALL_REPOSITORIES;
  const groups = useMemo(() => groupByRepository(filterPrs(list?.prs ?? [], scope, repo, query)), [list, scope, repo, query]);

  if (!list) return error ? <p className="auto-error" role="alert">{error}</p> : <Loader />;
  return (
    <ListPage
      className="git-list"
      aria-label="Pull requests"
      head={
        <div className="git-tools">
          <div className="git-search-row">
            <SearchField className="git-search" aria-label="Search pull requests" placeholder="Search pull requests…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <IconButton variant="ghost" label="Refresh the list" tooltip="Refresh the list" disabled={refreshing} onClick={onRefresh}>
              <Icon name="refresh" />
            </IconButton>
          </div>
          <div className="git-filters">
            <Segmented label="Show" value={scope} options={SCOPES} onChange={setScope} />
            <Dropdown
              label="Repository"
              value={repo}
              options={[{ id: ALL_REPOSITORIES, label: "All repositories" }, ...repositories.map((r) => ({ id: r, label: r }))]}
              onPick={setRepository}
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
          <div key={group.repository} className="git-group">
            <h2 className="git-group-name" aria-label={group.repository}>
              <Icon name="gitBranch" /> {shortRepository(group.repository)} <span className="git-group-owner">{group.repository.split("/")[0]}</span>
            </h2>
            <ul className="git-rows">
              {group.prs.map((pr) => (
                <Row key={pr.number} pr={pr} session={sessionOf(threads, pr)} now={now} onOpenThread={onOpenThread} />
              ))}
            </ul>
          </div>
        ))
      )}
    </ListPage>
  );
}

function List(props: Omit<Props, "route">) {
  const { refresh, ...state } = useGitPrs();
  return <PrListView {...state} {...props} onRefresh={() => void refresh()} />;
}

function Detail({ route, threads, now, onOpenThread }: Props & { route: PrRef }) {
  const { refresh, ...state } = usePrDetail(route);
  return (
    <div className="git-detail-scroll">
      <PrDetail pr={route} {...state} onRefresh={() => void refresh()} now={now} session={sessionOf(threads, route)} onOpenSession={onOpenThread} />
    </div>
  );
}

/** The Pull requests page: your open pull requests, and one pull request's diff. */
export function GitView({ route, ...rest }: Props) {
  return <div className="git-page">{route ? <Detail key={`${route.repository}#${route.number}`} route={route} {...rest} /> : <List {...rest} />}</div>;
}

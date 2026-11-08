import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrCheckRun, PrDetail as Detail, PrDiff, PrRef } from "../../../../shared/pulls.ts";
import { relativeTime } from "../../lib/format.ts";
import { Badge, Button, ButtonLink, Icon, Loader, type IconName } from "../../ui/index.ts";
import { Counts, DiffFiles } from "./DiffFiles.tsx";
import { CHECKS, isWebUrl, REVIEWS } from "./pulls.ts";

const CHECK_ICONS: Record<PrCheckRun["state"], IconName> = { success: "circleCheck", failure: "alert", pending: "circle", skipped: "circle", neutral: "circle" };
const STATE_LABELS = { open: "Open", closed: "Closed", merged: "Merged" } as const;

function CheckRuns({ runs }: { runs: PrCheckRun[] }) {
  if (runs.length === 0) return null;
  return (
    <ul className="pulls-checks" aria-label="Checks">
      {runs.map((run, i) => (
        <li key={i} className={`pulls-check ${run.state}`}>
          <Icon name={CHECK_ICONS[run.state]} />
          {run.url && isWebUrl(run.url) ? (
            <a href={run.url} target="_blank" rel="noreferrer noopener">
              {run.name}
            </a>
          ) : (
            <span>{run.name}</span>
          )}
          <span className="pulls-check-state">{run.state}</span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  pr: PrRef;
  detail: Detail | null;
  detailError: string | null;
  diff: PrDiff | null;
  diffError: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  now: Date;
  /** The session linked to this pull request, when there is one. */
  session: DashboardThread | null;
  onOpenSession: (id: string, addOnly: boolean) => void;
}

/** One pull request: its status, its checks and its diff file by file. */
export function PrDetail({ pr, detail, detailError, diff, diffError, refreshing, onRefresh, now, session, onOpenSession }: Props) {
  const checks = detail ? CHECKS[detail.checks] : null;
  const review = detail ? REVIEWS[detail.review] : null;
  return (
    <div className="pulls-detail">
      <header className="pulls-detail-head">
        <ButtonLink variant="ghost" size="sm" href="#/pulls" className="pulls-back">
          <Icon name="arrowLeft" /> Pull requests
        </ButtonLink>
        <h2 className="pulls-title">
          {detail?.title ?? `${pr.repository}#${pr.number}`} {detail && <span className="pulls-num">#{detail.number}</span>}
        </h2>
        {detail && (
          <>
            <p className="pulls-meta">
              {detail.repository} · {detail.author} · <code>{detail.headRef}</code> → <code>{detail.baseRef}</code> · updated {relativeTime(detail.updatedAt, now)}
            </p>
            <div className="pulls-badges">
              <Badge variant={detail.state === "merged" ? "done" : "neutral"}>{detail.draft ? "Draft" : STATE_LABELS[detail.state]}</Badge>
              {checks && <Badge variant={checks.variant}>{checks.label}</Badge>}
              {review && <Badge variant={review.variant}>{review.label}</Badge>}
              <Counts additions={detail.additions} deletions={detail.deletions} />
              <span className="pulls-files">{detail.changedFiles} files</span>
            </div>
            <div className="pulls-detail-actions">
              {isWebUrl(detail.url) && (
                <ButtonLink size="sm" href={detail.url} target="_blank" rel="noreferrer noopener">
                  <Icon name="arrowUpRight" /> Open on GitHub
                </ButtonLink>
              )}
              {session && (
                <Button size="sm" onClick={(e) => onOpenSession(session.id, e.shiftKey)}>
                  <Icon name="messagesSquare" /> Open session
                </Button>
              )}
            </div>
            <CheckRuns runs={detail.checkRuns} />
            {detail.reviews.length > 0 && (
              <ul className="pulls-reviews" aria-label="Reviews">
                {detail.reviews.map((r, i) => (
                  <li key={i}>
                    <strong>{r.author}</strong> {r.state.toLowerCase().replace("_", " ")}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {detailError && <p className="auto-error" role="alert">{detailError}</p>}
      </header>
      {diffError && (
        <div className="pulls-diff-error">
          <p className="auto-error" role="alert">{diffError}</p>
          <Button size="sm" variant="secondary" disabled={refreshing} onClick={onRefresh}>Retry</Button>
        </div>
      )}
      {diff ? <DiffFiles key={diff.headSha} files={diff.files} truncated={diff.truncated} refreshing={refreshing} onRefresh={onRefresh} /> : !diffError && <Loader />}
    </div>
  );
}

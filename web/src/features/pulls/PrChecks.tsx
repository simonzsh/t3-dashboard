import { useRef, useState } from "react";
import type { PrCheckRun, PrDetail } from "../../../../shared/pulls.ts";
import { Badge, Chevron, Icon, Popover, Pressable, type IconName } from "../../ui/index.ts";
import { CHECKS, isWebUrl, REVIEWS } from "./pulls.ts";

const CHECK_ICONS: Record<PrCheckRun["state"], IconName> = { success: "circleCheck", failure: "alert", pending: "circle", skipped: "circle", neutral: "circle" };

type Status = Pick<PrDetail, "checks" | "review" | "checkRuns" | "reviews">;

/** Each check with its result and link, then each review. */
export function ChecksPanel({ detail }: { detail: Status }) {
  return (
    <div className="pulls-checks-panel">
      {detail.checkRuns.length > 0 && (
        <>
          <h3 className="pulls-panel-title">Checks</h3>
          <ul className="pulls-checks" aria-label="Checks">
            {detail.checkRuns.map((run, i) => (
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
        </>
      )}
      <h3 className="pulls-panel-title">Reviews</h3>
      {detail.reviews.length > 0 ? (
        <ul className="pulls-reviews" aria-label="Reviews">
          {detail.reviews.map((r, i) => (
            <li key={i}>
              <strong>{r.author}</strong> {r.state.toLowerCase().replace("_", " ")}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pulls-panel-empty">No reviews yet.</p>
      )}
    </div>
  );
}

/** The checks and review badges: a click shows the detail in a popover instead of a list on the page. */
export function StatusButton({ detail }: { detail: Status }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const checks = CHECKS[detail.checks];
  const review = REVIEWS[detail.review];
  if (!checks && !review && detail.checkRuns.length === 0 && detail.reviews.length === 0) return null;
  return (
    <>
      <Pressable ref={anchor} className="pulls-status" aria-label="Checks and reviews" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        {checks && <Badge variant={checks.variant}>{checks.label}</Badge>}
        {review && <Badge variant={review.variant}>{review.label}</Badge>}
        {!checks && !review && <Badge>Checks</Badge>}
        <Chevron open={open} />
      </Pressable>
      {open && (
        <Popover
          anchor={anchor}
          role="dialog"
          minWidth={260}
          className="dropdown-menu pulls-checks-pop"
          onClose={(reason) => {
            setOpen(false);
            if (reason === "escape") anchor.current?.focus();
          }}
        >
          <ChecksPanel detail={detail} />
        </Popover>
      )}
    </>
  );
}

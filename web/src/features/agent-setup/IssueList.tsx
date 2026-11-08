import type { SetupIssue } from "../../../../shared/api.ts";
import { Badge, type BadgeVariant } from "../../ui/index.ts";
import { displayPath } from "./setupTree.ts";

export const SEVERITY_VARIANT: Record<SetupIssue["severity"], BadgeVariant> = { error: "error", warning: "neutral", info: "neutral" };

/** Issue lines: a severity badge, the message, and the path it points at. */
export function IssueList({ issues, home }: { issues: SetupIssue[]; home?: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className="as-issues">
      {issues.map((issue, i) => (
        <li key={`${issue.code}-${i}`}>
          <Badge variant={SEVERITY_VARIANT[issue.severity]}>{issue.severity}</Badge>
          <span>
            {issue.message}
            {issue.path && <code className="as-path">{home ? displayPath(issue.path, home) : issue.path}</code>}
          </span>
        </li>
      ))}
    </ul>
  );
}

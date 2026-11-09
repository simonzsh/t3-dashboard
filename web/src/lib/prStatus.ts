import type { IconName } from "../ui/index.ts";

export function prStatus(pr: { state?: string | null; draft?: boolean }) {
  const state = pr.state === "open" && pr.draft ? "draft" : pr.state ?? "unknown";
  const styles: Record<string, { label: string; icon: IconName }> = {
    open: { label: "Open", icon: "gitPullRequest" },
    merged: { label: "Merged", icon: "gitMerge" },
    closed: { label: "Closed", icon: "gitPullRequestClosed" },
    draft: { label: "Draft", icon: "gitPullRequestDraft" },
    unknown: { label: "Status unknown", icon: "gitPullRequest" },
  };
  return { ...(styles[state] ?? styles.unknown)!, className: `pr-status-${styles[state] ? state : "unknown"}` };
}

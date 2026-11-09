import type { PrRef } from "../../../shared/pulls.ts";
import { isRepository } from "../../../shared/pulls.ts";
import type { IconName } from "../ui/index.ts";

export type Tab = "dashboard" | "sessions" | "pulls" | "automations" | "news";

export const TABS: ReadonlyArray<{ id: Tab; label: string; icon: IconName; description: string; /** Bottom bar label, when the full one is too wide. */ short?: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "layoutPanels", description: "Usage limits, activity, and every agent that needs you." },
  { id: "sessions", label: "Sessions", icon: "messagesSquare", description: "Your open conversations side by side, scrolling sideways." },
  { id: "pulls", label: "Pull requests", short: "PRs", icon: "gitPullRequest", description: "Your open pull requests and the ones waiting for your review." },
  { id: "automations", label: "Automations", icon: "calendarClock", description: "Scheduled agents and their latest runs." },
  { id: "news", label: "News", icon: "newspaper", description: "AI-written articles on the latest tech news." },
];

// The nav entry, found by the animations that fly into it.
export const tabSelector = (tab: Tab): string => `[data-tab="${tab}"]`;

export const hashForTab = (tab: Tab): string => `#/${tab}`;

/** The Pull requests page opened on one pull request's diff. */
export const hashForPr = ({ repository, number }: PrRef, fromSession?: string): string =>
  `#/pulls/${repository}/${number}${fromSession ? `?fromSession=${encodeURIComponent(fromSession)}` : ""}`;

/** The pull request of a `#/pulls/<owner>/<repo>/<number>` hash; null for any other hash. */
export function prFromHash(hash: string): PrRef | null {
  const match = /^#\/pulls\/([^/]+\/[^/]+)\/([1-9]\d{0,8})$/.exec(hash.split("?")[0]!);
  return match && isRepository(match[1]!) ? { repository: match[1]!, number: Number(match[2]) } : null;
}

/** The Sessions tab opened on one thread: the link inside a phone alert. */
export const hashForSession = (id: string): string => `#/sessions/${encodeURIComponent(id)}`;

/** The thread of a `#/sessions/<id>` hash; null for any other hash. */
export function sessionFromHash(hash: string): string | null {
  const match = /^#\/sessions\/([^/]+)$/.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

// An empty or unknown hash falls back to the Dashboard, so a bad link never shows a blank page.
export function tabFromHash(hash: string): Tab {
  if (prFromHash(hash)) return "pulls";
  if (sessionFromHash(hash)) return "sessions";
  return TABS.find(({ id }) => hashForTab(id) === hash)?.id ?? "dashboard";
}

/** The source session belongs to this PR address, not to global navigation history. */
export function prSourceFromHash(hash: string): string | null {
  if (!prFromHash(hash)) return null;
  return new URLSearchParams(hash.split("?").slice(1).join("?")).get("fromSession") || null;
}

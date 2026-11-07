import type { IconName } from "../ui/index.ts";

export type Tab = "dashboard" | "sessions" | "automations" | "news";

export const TABS: ReadonlyArray<{ id: Tab; label: string; icon: IconName; description: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "layoutPanels", description: "Usage limits, activity, and every agent that needs you." },
  { id: "sessions", label: "Sessions", icon: "messagesSquare", description: "Your open conversations side by side, scrolling sideways." },
  { id: "automations", label: "Automations", icon: "calendarClock", description: "Scheduled agents and their latest runs." },
  { id: "news", label: "News", icon: "newspaper", description: "A daily AI article with the news on your topics." },
];

// The nav entry, found by the animations that fly into it.
export const tabSelector = (tab: Tab): string => `[data-tab="${tab}"]`;

export const hashForTab = (tab: Tab): string => `#/${tab}`;

// An empty or unknown hash falls back to the Dashboard, so a bad link never shows a blank page.
export function tabFromHash(hash: string): Tab {
  return TABS.find(({ id }) => hashForTab(id) === hash)?.id ?? "dashboard";
}

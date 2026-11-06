import type { IconName } from "../ui/index.ts";

export type Tab = "dashboard" | "sessions" | "automations";

export const TABS: ReadonlyArray<{ id: Tab; label: string; key: string; icon: IconName; description: string }> = [
  { id: "dashboard", label: "Dashboard", key: "1", icon: "layoutPanels", description: "Usage, and every agent that needs you." },
  { id: "sessions", label: "Sessions", key: "2", icon: "messagesSquare", description: "Your open conversations side by side, scrolling sideways." },
  { id: "automations", label: "Automations", key: "3", icon: "calendarClock", description: "Scheduled agents and their latest runs." },
];

// The nav entry, found by the animations that fly into it.
export const tabSelector = (tab: Tab): string => `[data-tab="${tab}"]`;

export const hashForTab = (tab: Tab): string => `#/${tab}`;

// An empty or unknown hash falls back to the Dashboard, so a bad link never shows a blank page.
export function tabFromHash(hash: string): Tab {
  return TABS.find(({ id }) => hashForTab(id) === hash)?.id ?? "dashboard";
}

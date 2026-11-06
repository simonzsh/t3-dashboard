import type { IconName } from "../ui/index.ts";

export type Tab = "home" | "desk" | "automations";

export const TABS: ReadonlyArray<{ id: Tab; label: string; key: string; icon: IconName; description: string }> = [
  { id: "home", label: "Home", key: "1", icon: "home", description: "Usage, and every agent that needs you." },
  { id: "desk", label: "Desk", key: "2", icon: "layoutPanels", description: "Your open conversations side by side." },
  { id: "automations", label: "Automations", key: "3", icon: "calendarClock", description: "Scheduled agents and their latest runs." },
];

// The nav entry, found by the animations that fly into it.
export const tabSelector = (tab: Tab): string => `[data-tab="${tab}"]`;

export const hashForTab = (tab: Tab): string => `#/${tab}`;

// An empty, unknown or old (#/inbox) hash falls back to Home, so an old link never shows a blank page.
export function tabFromHash(hash: string): Tab {
  return TABS.find(({ id }) => hashForTab(id) === hash)?.id ?? "home";
}

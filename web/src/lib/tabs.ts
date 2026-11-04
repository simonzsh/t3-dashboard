export type Tab = "desk" | "inbox" | "automations";

export const TABS: ReadonlyArray<{ id: Tab; label: string; key: string }> = [
  { id: "desk", label: "Desk", key: "1" },
  { id: "inbox", label: "Inbox", key: "2" },
  { id: "automations", label: "Automations", key: "3" },
];

// The header tab button, found by the animations that fly into it.
export const tabSelector = (tab: Tab): string => `[data-tab="${tab}"]`;

export const hashForTab = (tab: Tab): string => `#/${tab}`;

// An empty or unknown hash falls back to the Inbox, so an old link never shows a blank page.
export function tabFromHash(hash: string): Tab {
  return TABS.find(({ id }) => hashForTab(id) === hash)?.id ?? "inbox";
}

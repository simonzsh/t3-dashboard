export type Tab = "agents" | "desk" | "board";

export const TABS: ReadonlyArray<{ id: Tab; label: string; key: string }> = [
  { id: "agents", label: "Agents", key: "1" },
  { id: "desk", label: "Desk", key: "2" },
  { id: "board", label: "Board", key: "3" },
];

export const hashForTab = (tab: Tab): string => `#/${tab}`;

// An empty or unknown hash falls back to Agents, so an old link never shows a blank page.
export function tabFromHash(hash: string): Tab {
  return TABS.find(({ id }) => hashForTab(id) === hash)?.id ?? "agents";
}

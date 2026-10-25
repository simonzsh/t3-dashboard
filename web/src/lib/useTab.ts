import { useEffect, useSyncExternalStore } from "react";
import { hashForTab, tabFromHash, type Tab } from "./tabs.ts";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

// The URL hash is the only state: reload, back and forward all go through it.
export function useTab(): [Tab, (tab: Tab) => void] {
  const tab = useSyncExternalStore(subscribe, () => tabFromHash(location.hash));
  useEffect(() => {
    if (location.hash !== hashForTab(tab)) history.replaceState(history.state, "", hashForTab(tab));
  }, [tab]);
  const setTab = (next: Tab) => {
    if (location.hash !== hashForTab(next)) location.hash = hashForTab(next);
  };
  return [tab, setTab];
}

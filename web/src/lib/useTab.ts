import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { PrRef } from "../../../shared/pulls.ts";
import { hashForTab, prFromHash, tabFromHash, type Tab } from "./tabs.ts";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

// The URL hash is the only state: reload, back and forward all go through it.
export function useTab(): [Tab, (tab: Tab) => void] {
  const tab = useSyncExternalStore(subscribe, () => tabFromHash(location.hash));
  useEffect(() => {
    // A pull request hash is a valid address of the Pull requests tab: keep it.
    if (location.hash !== hashForTab(tab) && !prFromHash(location.hash)) history.replaceState(history.state, "", hashForTab(tab));
  }, [tab]);
  const setTab = (next: Tab) => {
    if (location.hash !== hashForTab(next)) location.hash = hashForTab(next);
  };
  return [tab, setTab];
}

/** The pull request the hash points at, or null on the pull request list and on every other page. */
export function usePrRoute(): PrRef | null {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return useMemo(() => prFromHash(hash), [hash]);
}

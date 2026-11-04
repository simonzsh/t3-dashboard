import { useSyncExternalStore } from "react";
import type { StashEntry } from "../../../shared/stash.ts";

// One stash list for the page: every composer and the server's "stash" events share it.
let entries: StashEntry[] = [];
const listeners = new Set<() => void>();

export function setStash(next: StashEntry[] | ((list: StashEntry[]) => StashEntry[])): void {
  entries = typeof next === "function" ? next(entries) : next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const useStash = (): StashEntry[] => useSyncExternalStore(subscribe, () => entries);

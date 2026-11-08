import { useCallback } from "react";
import { readKey, usePersisted, writeKey, type Store } from "../../lib/storage.ts";

export const NEWS_LIST_KEY = "t3-dashboard-news-list";

export const loadNewsListHidden = (storage: Store | null): boolean => readKey(storage, NEWS_LIST_KEY) === "hidden";

export const saveNewsListHidden = (storage: Store | null, hidden: boolean): void => writeKey(storage, NEWS_LIST_KEY, hidden ? "hidden" : "shown");

/** Whether the News article list is hidden on a wide screen, saved in this browser, and a toggle. */
export function useNewsListHidden(): [boolean, () => void] {
  const [hidden, setHidden] = usePersisted(loadNewsListHidden, saveNewsListHidden);
  return [hidden, useCallback(() => setHidden((was) => !was), [setHidden])];
}

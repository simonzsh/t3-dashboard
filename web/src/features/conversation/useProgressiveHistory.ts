import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from "react";
import { historyStart, timelineKey, type Entry } from "./timeline.ts";

export const HISTORY_BATCH = 40;

/** Prepend real rows and keep the reader's anchor; never estimate unloaded heights. */
export function useProgressiveHistory(entries: Entry[], scroller: RefObject<HTMLElement | null>, following: boolean, searchMessageId: string | null, onReadHistory: () => void) {
  const marker = useRef<HTMLDivElement>(null);
  const first = useRef<string | null>(null);
  const anchor = useRef<{ element: Element; top: number } | null>(null);
  const [, render] = useReducer(n => n + 1, 0);
  const start = historyStart(entries, first.current, following, searchMessageId, HISTORY_BATCH);

  useLayoutEffect(() => {
    first.current = entries[start] ? timelineKey(entries[start]!) : null;
    const saved = anchor.current;
    anchor.current = null;
    if (saved?.element.isConnected && scroller.current) {
      scroller.current.scrollTop += saved.element.getBoundingClientRect().top - saved.top;
    }
  });

  const loadEarlier = useCallback(() => {
    if (!start || anchor.current) return;
    const element = marker.current?.nextElementSibling;
    if (element) anchor.current = { element, top: element.getBoundingClientRect().top };
    onReadHistory();
    first.current = timelineKey(entries[Math.max(0, start - HISTORY_BATCH)]!);
    render();
  }, [entries, start, onReadHistory]);

  useEffect(() => {
    const target = marker.current;
    const root = scroller.current;
    if (!target || !root || following || searchMessageId) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) loadEarlier();
    }, { root, rootMargin: "200px 0px 0px", threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadEarlier, following, searchMessageId, scroller]);

  return { marker, start, loadEarlier };
}

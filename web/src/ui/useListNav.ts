import { useEffect, useRef, useState } from "react";
import { moveActive } from "../lib/dropdown.ts";

/** New active index for a list key, or null when the key is not a list key. Arrows wrap (via moveActive). */
export function nextActive(key: string, active: number, count: number, homeEnd = true): number | null {
  if (key === "ArrowDown" || key === "ArrowUp") return moveActive(count, active, key === "ArrowDown" ? 1 : -1);
  if (homeEnd && (key === "Home" || key === "End")) return count === 0 ? -1 : key === "Home" ? 0 : count - 1;
  return null;
}

export interface ListNavOptions {
  /** Active index on mount; default -1 (nothing active). */
  initial?: number;
  /** Enter (and Space with `space`) picks the active row; not called when nothing is active. Latest value is always used. */
  onPick?: (index: number) => void;
  /** Home/End jump to the ends; default true. Pass false where they must move a caret (folder path field, stash). */
  homeEnd?: boolean;
  /** Space also picks (a menu with no text field). Default false. */
  space?: boolean;
  /** DOM id of row i: when given, keyboard moves and setActive scroll that row into view; hover never scrolls. */
  itemId?: (index: number) => string;
}

export interface ListNav {
  /** Clamped to count - 1; -1 when nothing is active or the list is empty. */
  active: number;
  /** Sets the active row from code (open, new query); scrolls it into view when itemId is set. */
  setActive: (index: number) => void;
  /** Sets the active row from the pointer; no scroll. */
  hover: (index: number) => void;
  /** Handles ArrowUp/Down, Home/End, Enter(/Space). Calls preventDefault and returns true when it used the key. Accepts React and native events. */
  onKeyDown: (e: { key: string; preventDefault(): void }) => boolean;
}

/** Active row and keys of a list of options: arrows wrap, Home/End jump, Enter picks. */
export function useListNav(count: number, options: ListNavOptions = {}): ListNav {
  const { initial = -1, homeEnd = true, space = false } = options;
  const [raw, setRaw] = useState(initial);
  const [scroll, setScroll] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const active = Math.min(raw, count - 1);

  // Only code and keys scroll (and a row active on mount): under a still pointer, hover would fight a scrolling list.
  useEffect(() => {
    if ((scroll > 0 || initial >= 0) && active >= 0) document.getElementById(latest.current.itemId?.(active) ?? "")?.scrollIntoView({ block: "nearest" });
  }, [scroll]);

  function setActive(index: number) {
    setRaw(index);
    setScroll((n) => n + 1);
  }

  function onKeyDown(e: { key: string; preventDefault(): void }): boolean {
    const next = nextActive(e.key, active, count, homeEnd);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      return true;
    }
    if ((e.key === "Enter" || (space && e.key === " ")) && active >= 0) {
      e.preventDefault();
      latest.current.onPick?.(active);
      return true;
    }
    return false;
  }

  return { active, setActive, hover: setRaw, onKeyDown };
}

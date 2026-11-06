import { useCallback, useRef, useState } from "react";

export type Store = Pick<Storage, "getItem" | "setItem">;

// Storage can throw (private mode, blocked cookies): a read then finds nothing and a write is lost.
export function readKey(storage: Store | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** The parsed JSON of a key; null when it is missing or broken. */
export function readJson(storage: Store | null, key: string): unknown {
  const raw = readKey(storage, key);
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeKey(storage: Store | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignored on purpose: the value only lives for this page.
  }
}

// Reading the localStorage global itself throws when storage is blocked.
export function browserStorage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** A value kept in this browser. The setter saves at once, so mounting writes nothing. */
export function usePersisted<T>(load: (storage: Store | null) => T, save: (storage: Store | null, value: T) => void): [T, (next: T | ((was: T) => T)) => void] {
  const [value, setValue] = useState(() => load(browserStorage()));
  // Two updates in one event must chain, so the setter reads the latest value from a ref.
  const latest = useRef(value);
  const set = useCallback(
    (next: T | ((was: T) => T)) => {
      const value = typeof next === "function" ? (next as (was: T) => T)(latest.current) : next;
      latest.current = value;
      save(browserStorage(), value);
      setValue(value);
    },
    [save],
  );
  return [value, set];
}

export type Store = Pick<Storage, "getItem" | "setItem">;

// Storage can throw (private mode, blocked cookies): a read then finds nothing and a write is lost.
export function readKey(storage: Store | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
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

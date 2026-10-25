export type Store = Pick<Storage, "getItem" | "setItem">;

// Reading the localStorage global itself throws when storage is blocked.
export function browserStorage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

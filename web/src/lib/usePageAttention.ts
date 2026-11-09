import { useSyncExternalStore } from "react";

/** The part of `document` the attention check reads. */
export interface AttentionDoc {
  visibilityState: string;
  hasFocus(): boolean;
}

/** The user looks at the page: it shows and its window has the focus. */
export const hasAttention = (doc: AttentionDoc | undefined): boolean => doc !== undefined && doc.visibilityState === "visible" && doc.hasFocus();

/** Calls `cb` when the page shows, hides, gains or loses the focus; returns the remover. */
export function onAttentionChange(target: Pick<EventTarget, "addEventListener" | "removeEventListener">, doc: Pick<EventTarget, "addEventListener" | "removeEventListener">, cb: () => void): () => void {
  doc.addEventListener("visibilitychange", cb);
  target.addEventListener("focus", cb);
  target.addEventListener("blur", cb);
  return () => {
    doc.removeEventListener("visibilitychange", cb);
    target.removeEventListener("focus", cb);
    target.removeEventListener("blur", cb);
  };
}

const subscribe = (cb: () => void) => (typeof window === "undefined" ? () => {} : onAttentionChange(window, document, cb));
const snapshot = () => hasAttention(typeof document === "undefined" ? undefined : document);

// A background tab or a screen left on must not read a session for the user.
export const usePageAttention = (): boolean => useSyncExternalStore(subscribe, snapshot, () => false);

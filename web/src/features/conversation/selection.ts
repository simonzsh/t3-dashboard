const SELECTION_SETTLE_MS = 160;

export function watchSelection(events: EventTarget, viewport: EventTarget, read: () => void, hide: () => void, touch = false): () => void {
  let pointerDown = false;
  const keys = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); hide(); };
  const settle = () => {
    clearTimeout(timer);
    if (!pointerDown && keys.size === 0) timer = setTimeout(read, SELECTION_SETTLE_MS);
  };
  const change = () => { cancel(); settle(); };
  const start = (event: Event) => {
    // Cite prevents pointerdown to preserve the selection until its click.
    if (event.defaultPrevented) return;
    // Native touch handles can consume pointerup; selectionchange is authoritative.
    pointerDown = !touch;
    cancel();
  };
  const end = () => { pointerDown = false; settle(); };
  const reset = () => { pointerDown = false; keys.clear(); cancel(); };
  const cancelled = () => { reset(); if (touch) settle(); };
  const moved = () => { cancel(); if (touch) settle(); };
  const keydown = (event: Event) => {
    const e = event as KeyboardEvent;
    const selectionKey = e.key === "Shift" || (e.shiftKey && /^(Arrow\w+|Home|End|PageUp|PageDown)$/.test(e.key)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a");
    if (!selectionKey || e.defaultPrevented) return;
    keys.add(e.key);
    cancel();
  };
  const keyup = (event: Event) => {
    if (keys.delete((event as KeyboardEvent).key)) settle();
  };
  events.addEventListener("selectionchange", change);
  events.addEventListener("pointerdown", start);
  events.addEventListener("pointerup", end);
  events.addEventListener("pointercancel", cancelled);
  events.addEventListener("keydown", keydown);
  events.addEventListener("keyup", keyup);
  viewport.addEventListener("scroll", moved, true);
  viewport.addEventListener("resize", moved);
  viewport.addEventListener("blur", reset);
  return () => {
    clearTimeout(timer);
    events.removeEventListener("selectionchange", change);
    events.removeEventListener("pointerdown", start);
    events.removeEventListener("pointerup", end);
    events.removeEventListener("pointercancel", cancelled);
    events.removeEventListener("keydown", keydown);
    events.removeEventListener("keyup", keyup);
    viewport.removeEventListener("scroll", moved, true);
    viewport.removeEventListener("resize", moved);
    viewport.removeEventListener("blur", reset);
  };
}

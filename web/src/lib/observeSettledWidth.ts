// Width animations must not trigger chart renders or textarea layout reads every frame.
export function observeSettledWidth(element: Element, update: (width: number) => void, delay = 80): () => void {
  let width: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new ResizeObserver(([entry]) => {
    if (!entry || entry.contentRect.width === width) return;
    const first = width === undefined;
    width = entry.contentRect.width;
    clearTimeout(timer);
    if (first) update(width);
    else timer = setTimeout(() => update(width!), delay);
  });
  observer.observe(element);
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}

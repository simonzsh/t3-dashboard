import { useEffect, type RefObject } from "react";

/** Keep text layout stable while either left panel slides; clip the excess at the page edge. */
export function observeSessionPanelMotion(area: HTMLElement, app: HTMLElement): () => void {
  const panels = new Map<HTMLElement, number>();
  const previous = { width: area.style.width, flex: area.style.flex };
  let frame = 0;

  const restore = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    panels.clear();
    area.style.width = previous.width;
    area.style.flex = previous.flex;
  };
  const start = (event: TransitionEvent) => {
    const panel = event.target;
    if (event.propertyName !== "width" || !(panel instanceof HTMLElement)) return;
    const sidebar = panel.parentElement === app && panel.matches(".sidebar");
    const list = panel.parentElement === area.parentElement && panel.matches(".side-panel");
    if (!sidebar && !list) return;
    const animation = panel.getAnimations().find(a => "transitionProperty" in a && a.transitionProperty === "width");
    const frames = (animation?.effect as KeyframeEffect | null)?.getKeyframes();
    const from = Number.parseFloat(String(frames?.[0]?.width));
    const target = Number.parseFloat(String(frames?.at(-1)?.width));
    if (!Number.isFinite(from) || !Number.isFinite(target)) return;

    cancelAnimationFrame(frame);
    frame = 0;
    // transitionrun can arrive after the first sampled frame. Recover both
    // endpoints instead of freezing a width already partway through the slide.
    panels.set(panel, Math.min(from, target));
    const listPanel = area.parentElement?.querySelector<HTMLElement>(":scope > .side-panel");
    const available = (area.parentElement?.clientWidth ?? 0) - (listPanel?.getBoundingClientRect().width ?? 0);
    const delta = [...panels].reduce((sum, [element, minWidth]) => sum + element.getBoundingClientRect().width - minWidth, 0);
    // Use the wider endpoint to fill the area in both directions, without stretching text.
    const width = Math.max(area.getBoundingClientRect().width, available, available + delta);
    area.style.flex = "none";
    area.style.width = `${width}px`;
  };
  const end = (event: TransitionEvent) => {
    if (event.propertyName !== "width" || !panels.delete(event.target as HTMLElement) || panels.size) return;
    // A reversal emits cancel then run. Wait one frame so it keeps the frozen width.
    frame = requestAnimationFrame(restore);
  };
  app.addEventListener("transitionrun", start);
  app.addEventListener("transitionend", end);
  app.addEventListener("transitioncancel", end);
  window.addEventListener("resize", restore);
  return () => {
    app.removeEventListener("transitionrun", start);
    app.removeEventListener("transitionend", end);
    app.removeEventListener("transitioncancel", end);
    window.removeEventListener("resize", restore);
    restore();
  };
}

export function useSessionPanelMotion(root: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const area = root.current?.querySelector<HTMLElement>(".sessions-area");
    const app = root.current?.closest<HTMLElement>(".app");
    if (area && app) return observeSessionPanelMotion(area, app);
  }, [root, enabled]);
}

import { reducedMotion } from "./motion.ts";

/** Width reflow must not restart height animations in every nested disclosure. */
export class CollapseMotion {
  private width: number | null = null;
  private height = 0;
  private open: boolean | null = null;
  private animation: Animation | null = null;

  resize(element: HTMLElement, inner: HTMLElement, open: boolean, duration: number): void {
    const width = inner.offsetWidth;
    const resized = this.width !== null && this.width !== width && this.open === open;
    const next = open ? inner.offsetHeight : 0;
    this.width = width;
    this.open = open;
    if (next === this.height && !resized) return;
    // Layout sizes exclude parent transforms from window and row animations.
    const from = element.offsetHeight;
    this.cancel();
    this.height = next;
    element.style.height = `${next}px`;
    if (!resized && !reducedMotion() && from !== next) {
      this.animation = element.animate([{ height: `${from}px` }, { height: `${next}px` }], {
        duration, easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    }
  }

  cancel(): void {
    this.animation?.cancel();
    this.animation = null;
  }
}

interface Scroller {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** True when `el` can still move by this delta: a positive delta scrolls down (or right). */
export function canScrollBy(el: Scroller, dx: number, dy: number): boolean {
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy < 0) return el.scrollTop > 0;
    if (dy > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    return false;
  }
  if (dx < 0) return el.scrollLeft > 0;
  return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

const SCROLLS = /(auto|scroll)/;

// An element between the gesture target and `root` (included) that takes this scroll.
function takesScroll(target: EventTarget | null, root: HTMLElement, dx: number, dy: number): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el instanceof HTMLElement) {
      const style = getComputedStyle(el);
      if ((SCROLLS.test(style.overflowY) || SCROLLS.test(style.overflowX) || el instanceof HTMLTextAreaElement) && canScrollBy(el, dx, dy)) return true;
    }
    if (el === root) return false;
  }
  return false;
}

/**
 * While a modal is open, wheel and touch moves only scroll what is inside `box`.
 * Outside it, or at the end of its scroll, they do nothing: the page behind does not move.
 */
export function lockScroll(backdrop: HTMLElement, box: HTMLElement): () => void {
  let lastX = 0;
  let lastY = 0;
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || !takesScroll(e.target, box, e.deltaX, e.deltaY)) e.preventDefault();
  };
  const onTouchStart = (e: TouchEvent) => {
    lastX = e.touches[0]?.clientX ?? 0;
    lastY = e.touches[0]?.clientY ?? 0;
  };
  const onTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    // Two fingers: a pinch zoom, left to the browser.
    if (!touch || e.touches.length > 1) return;
    const dx = lastX - touch.clientX;
    const dy = lastY - touch.clientY;
    lastX = touch.clientX;
    lastY = touch.clientY;
    if (e.cancelable && !takesScroll(e.target, box, dx, dy)) e.preventDefault();
  };
  backdrop.addEventListener("wheel", onWheel, { passive: false });
  backdrop.addEventListener("touchstart", onTouchStart, { passive: true });
  backdrop.addEventListener("touchmove", onTouchMove, { passive: false });
  return () => {
    backdrop.removeEventListener("wheel", onWheel);
    backdrop.removeEventListener("touchstart", onTouchStart);
    backdrop.removeEventListener("touchmove", onTouchMove);
  };
}

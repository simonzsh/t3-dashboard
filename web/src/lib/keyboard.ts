import { useEffect } from "react";

// A visible area this much shorter than the window means an on-screen keyboard, not a browser bar.
const KEYBOARD_MIN = 120;

export function keyboardOpen(windowHeight: number, visibleHeight: number): boolean {
  return windowHeight - visibleHeight > KEYBOARD_MIN;
}

/** Sets `keyboard-open` on <html> while an on-screen keyboard is up: the CSS then drops the space kept for the home indicator and the bottom bar. */
export function useKeyboardClass() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    // The layout viewport (clientHeight) keeps its height under the iOS keyboard; innerHeight may not.
    const sync = () => root.classList.toggle("keyboard-open", keyboardOpen(root.clientHeight, vv.height));
    sync();
    vv.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      root.classList.remove("keyboard-open");
    };
  }, []);
}

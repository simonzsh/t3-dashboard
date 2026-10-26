import { useSyncExternalStore } from "react";

/** True once the page itself has scrolled down. */
export function useScrolled(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("scroll", onChange, { passive: true });
      return () => window.removeEventListener("scroll", onChange);
    },
    () => window.scrollY > 0,
  );
}

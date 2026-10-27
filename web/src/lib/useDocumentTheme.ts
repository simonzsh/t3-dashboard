import { useSyncExternalStore } from "react";

// Memoized views do not re-render on a theme switch: follow data-theme on <html> directly.
export function useDocumentTheme(): string {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.getAttribute("data-theme") ?? "light",
    () => "light",
  );
}

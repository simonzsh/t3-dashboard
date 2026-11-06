import { useEffect, useState } from "react";
import { browserStorage } from "../../lib/storage.ts";
import { ACCENTS, faviconSvg, loadAccent, saveAccent, type Accent } from "./accent.ts";

export function useAccent(): [Accent, (accent: Accent) => void] {
  const [accent, setAccent] = useState<Accent>(() => loadAccent(browserStorage()));

  // data-accent drives the CSS; the tab icon follows the accent too.
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    const color = ACCENTS.find((a) => a.id === accent)?.light ?? ACCENTS[0]!.light;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (icon) icon.href = faviconSvg(color);
  }, [accent]);

  return [
    accent,
    (next) => {
      saveAccent(browserStorage(), next);
      setAccent(next);
    },
  ];
}

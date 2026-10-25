import { useState } from "react";
import { loadBackground, saveBackground, type DeskBackground } from "./deskBackground.ts";
import { browserStorage } from "./storage.ts";

// The setter returns an error message when the background could not be stored.
export function useDeskBackground(): [DeskBackground, (next: DeskBackground) => string | null] {
  const [background, setBackground] = useState<DeskBackground>(() => loadBackground(browserStorage()));
  return [
    background,
    (next) => {
      const error = saveBackground(browserStorage(), next);
      if (!error) setBackground(next);
      return error;
    },
  ];
}

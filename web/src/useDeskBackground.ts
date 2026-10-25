import { useState } from "react";
import { loadBackground, saveBackground, type DeskBackground } from "./deskBackground.ts";

// The setter returns an error message when the background could not be stored.
export function useDeskBackground(): [DeskBackground, (next: DeskBackground) => string | null] {
  const [background, setBackground] = useState<DeskBackground>(() => loadBackground(localStorage));
  return [
    background,
    (next) => {
      const error = saveBackground(localStorage, next);
      if (!error) setBackground(next);
      return error;
    },
  ];
}

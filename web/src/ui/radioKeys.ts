import type { KeyboardEvent } from "react";

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** Index of the radio the arrow key selects (wraps), or null for other keys. */
export function nextRadioIndex(key: string, index: number, count: number): number | null {
  const step = STEP[key];
  if (step === undefined || count === 0) return null;
  return (index + step + count) % count;
}

/** Arrow keys move focus and selection between the radios of a group, as native radios do. */
export function onRadioKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const next = nextRadioIndex(e.key, radios.indexOf(document.activeElement as HTMLElement), radios.length);
  if (next === null || radios.indexOf(document.activeElement as HTMLElement) < 0) return;
  e.preventDefault();
  radios[next]?.focus();
  radios[next]?.click();
}

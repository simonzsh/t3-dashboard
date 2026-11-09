import type { DiffFile } from "../../../../shared/diff.ts";
import { isTestFile } from "./testFiles.ts";

// Like GitHub, a big file starts closed, and files stop opening once the diff passes a line budget.
export const LARGE_FILE = 400;
const OPEN_BUDGET = 3000;
// Above this many lines a file is shown without syntax colours: highlighting it would freeze the page.
export const PLAIN_ABOVE = 1000;

export const isLarge = (file: DiffFile): boolean => file.additions + file.deletions > LARGE_FILE;
export const canLoad = (file: DiffFile): boolean => !file.binary && !file.truncated && file.hunks.length > 0;
export const loadLabel = (file: DiffFile): string => `Load diff (${file.additions + file.deletions} lines)`;
export const shouldHighlight = (file: DiffFile): boolean => file.hunks.reduce((n, hunk) => n + hunk.lines.length, 0) <= PLAIN_ABOVE;

/** Whether an element is within `margin` px of the viewport. A hidden tab has no layout: wait for the observer. */
export const nearViewport = (laidOut: boolean, rect: { top: number; bottom: number }, viewport: number, margin: number): boolean => laidOut && rect.top < viewport + margin && rect.bottom > -margin;

export function openByDefault(files: DiffFile[]): Set<string> {
  const open = new Set<string>();
  let budget = OPEN_BUDGET;
  for (const file of files) {
    const changed = file.additions + file.deletions;
    if (isLarge(file) || changed > budget) continue;
    open.add(file.path);
    budget -= changed;
  }
  return open;
}

/** Per-file choices over the defaults: a path in `overrides` wins. */
export type Overrides = Record<string, boolean>;

export const isOpen = (overrides: Overrides, defaults: Set<string>, path: string): boolean => overrides[path] ?? defaults.has(path);

export const setAll = (files: DiffFile[], open: boolean): Overrides => Object.fromEntries(files.map((file) => [file.path, open]));

export const setTests = (overrides: Overrides, files: DiffFile[], open: boolean): Overrides => ({ ...overrides, ...Object.fromEntries(files.filter((file) => isTestFile(file.path)).map((file) => [file.path, open])) });

/** What the toolbar buttons offer next: "Collapse" while any file (or any test file) is open. */
export function toolbarOf(files: DiffFile[], open: (path: string) => boolean): { hasTests: boolean; anyOpen: boolean; testsOpen: boolean } {
  const tests = files.filter((file) => isTestFile(file.path));
  return { hasTests: tests.length > 0, anyOpen: files.some((file) => open(file.path)), testsOpen: tests.some((file) => open(file.path)) };
}

/** The file under the reading line: the last one whose top is at or above it, else the first. */
export function currentIndex(tops: number[], line: number): number {
  let index = 0;
  tops.forEach((top, i) => {
    if (top <= line) index = i;
  });
  return index;
}

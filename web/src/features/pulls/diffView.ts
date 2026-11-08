import type { DiffFile } from "../../../../shared/diff.ts";
import { isTestFile } from "./testFiles.ts";

// Like GitHub, a big file starts closed, and files stop opening once the diff passes a line budget.
export const LARGE_FILE = 400;
export const OPEN_BUDGET = 3000;

export function openByDefault(files: DiffFile[]): Set<string> {
  const open = new Set<string>();
  let budget = OPEN_BUDGET;
  for (const file of files) {
    const changed = file.additions + file.deletions;
    if (changed > LARGE_FILE || changed > budget) continue;
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

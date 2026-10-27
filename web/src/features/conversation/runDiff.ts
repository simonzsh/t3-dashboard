export const MAX_DIFF_LINES = 400;

/** The lines of one file in a unified git diff, from its first hunk. Null when the diff does not hold the file. */
export function fileSection(diff: string, path: string): string[] | null {
  const lines = diff.split("\n");
  // The header ends with the new path ("a/old b/new" for a rename).
  const start = lines.findIndex((line) => line.startsWith("diff --git ") && line.endsWith(` b/${path}`));
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith("diff --git "));
  const body = lines.slice(start + 1, end === -1 ? undefined : end);
  const hunk = body.findIndex((line) => line.startsWith("@@"));
  // Without a hunk (binary file, mode change) the extended header is all there is to show.
  return hunk === -1 ? body : body.slice(hunk);
}

export function limitLines(lines: string[]): { shown: string[]; hidden: number } {
  return { shown: lines.slice(0, MAX_DIFF_LINES), hidden: Math.max(0, lines.length - MAX_DIFF_LINES) };
}

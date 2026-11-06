import { posix } from "node:path";

/** "~" and "~/…" become paths under `home`; the rest stays as typed (trimmed). */
export function expandHome(path: string, home: string): string {
  const text = path.trim();
  if (text === "~") return home;
  return text.startsWith("~/") ? `${home}${text.slice(1)}` : text;
}

/** An absolute path without "..", "//" or a trailing slash ("/" stays "/"). */
export function normalizeFolder(path: string, home: string): string {
  const clean = posix.normalize(expandHome(path, home));
  return clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
}

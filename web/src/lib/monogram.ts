import { PROJECT_COLORS } from "../../../shared/projectColors.ts";

// Same algorithm as the T3 Code monogram, so a project looks alike in both apps.
const NAMES = Object.keys(PROJECT_COLORS);
const clean = (s: string) => s.normalize("NFKC").trim();

/** One or two characters: the first letter, then a later digit, the last word's initial or the last letter. */
export function monogramText(title: string): string {
  const tokens = clean(title).match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = tokens[0];
  if (!first) return "PR";
  const chars = Array.from(first);
  const a = chars[0] ?? "P";
  const b = chars.slice(1).find((c) => /\p{N}/u.test(c)) ?? (tokens.length > 1 ? Array.from(tokens.at(-1) ?? "")[0] : chars.at(-1)) ?? a;
  return Array.from(`${a}${b}`.toUpperCase()).slice(0, 2).join("");
}

/** A hex color picked from the title by a stable hash. */
export function monogramColor(title: string): string {
  const t = clean(title).toLocaleLowerCase("en-US") || "project";
  let n = 0;
  for (const c of t) n = (n * 31 + (c.codePointAt(0) ?? 0)) % NAMES.length;
  return PROJECT_COLORS[NAMES[n] ?? "blue"]!;
}

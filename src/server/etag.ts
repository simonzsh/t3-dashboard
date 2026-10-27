/** True when an if-none-match list holds the tag. Weak comparison: `W/` is ignored. */
export function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  const bare = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.trim() === "*" || header.split(",").some((tag) => bare(tag) === bare(etag));
}

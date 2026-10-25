/** A ReadFile over a map of paths; a missing path throws ENOENT like the disk. */
export const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

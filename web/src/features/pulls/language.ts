// Kept apart from highlight.tsx: the page picks a language before the highlighter chunk loads.
const BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json", css: "css", scss: "scss", less: "less",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", vue: "xml",
  md: "markdown", mdx: "markdown", py: "python", rb: "ruby", go: "go", rs: "rust",
  java: "java", kt: "kotlin", swift: "swift", php: "php", c: "c", h: "c",
  cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", sh: "bash", bash: "bash", zsh: "bash",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", sql: "sql", graphql: "graphql",
  diff: "diff", patch: "diff", lua: "lua", pl: "perl", r: "r", mk: "makefile",
};
const BY_NAME: Record<string, string> = { dockerfile: "bash", makefile: "makefile" };

export function languageOf(path: string): string | undefined {
  const file = (path.split("/").pop() ?? "").toLowerCase();
  const dot = file.lastIndexOf(".");
  const lang = BY_NAME[file] ?? (dot >= 0 ? BY_EXT[file.slice(dot + 1)] : undefined);
  return lang;
}

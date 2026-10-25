import type { ReadFile } from "./config.ts";

const key = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const fields = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});

// A missing or broken file gives no key; the content is never quoted, since it holds the key.
// An old `workspaces` list gives its first non-empty key; the next save writes the simple form.
export function readLinearKey(file: string, readFile: ReadFile): string {
  let root: Record<string, unknown>;
  try {
    root = fields(JSON.parse(readFile(file)));
  } catch {
    return "";
  }
  if (!Array.isArray(root.workspaces)) return key(root.apiKey);
  return root.workspaces.map((entry: unknown) => key(fields(entry).apiKey)).find((apiKey) => apiKey !== "") ?? "";
}

export function writeLinearKey(file: string, apiKey: string, writeSecret: (file: string, text: string) => void): void {
  writeSecret(file, `${JSON.stringify({ apiKey }, null, 2)}\n`);
}

import type { FolderBrowseResult } from "../../../../shared/api.ts";

const MAX_PATH = 512;

/** Same rule as the server: "/…", "~" or "~/…", with no control character. */
export function isFolderPath(text: string): boolean {
  const path = text.trim();
  if (path.length === 0 || path.length > MAX_PATH) return false;
  if (!path.startsWith("/") && path !== "~" && !path.startsWith("~/")) return false;
  return !/[\u0000-\u001f\u007f]/.test(path);
}

/** The title the server picks when none is typed; "" for the home folder, whose name only the server knows. */
export function folderTitle(path: string): string {
  const parts: string[] = [];
  for (const part of path.trim().split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  }
  if (parts.length === 1 && parts[0] === "~") return "";
  return parts.pop() ?? "project";
}

export const addLabel = (kind: FolderBrowseResult["kind"] | null): "Add" | "Create & Add" => (kind === "missing" ? "Create & Add" : "Add");

/** An existing folder typed in full only matches itself: the parent to list its neighbours, else null.
 *  A query that ends with "/" asks for the folder's children: never its neighbours. */
export function siblingsQuery(query: string, result: FolderBrowseResult): string | null {
  if (query.endsWith("/")) return null;
  const alone = result.kind === "directory" && result.entries.every((e) => e.path === result.path);
  return alone ? result.path.slice(0, result.path.lastIndexOf("/") + 1) || null : null;
}

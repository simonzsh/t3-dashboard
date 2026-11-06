import type { FolderBrowseResult } from "../../../../shared/api.ts";

const MAX_PATH = 512;

/** Same rule as the server: "/…", "~" or "~/…", with no control character. */
export function isFolderPath(text: string): boolean {
  const path = text.trim();
  if (path.length === 0 || path.length > MAX_PATH) return false;
  if (!path.startsWith("/") && path !== "~" && !path.startsWith("~/")) return false;
  return !/[\u0000-\u001f\u007f]/.test(path);
}

/** The title the server picks when none is typed. */
export function folderTitle(path: string): string {
  return path.trim().split("/").filter((s) => s !== "" && s !== "~").pop() ?? "project";
}

export const addLabel = (kind: FolderBrowseResult["kind"] | null): "Add" | "Create & Add" => (kind === "missing" ? "Create & Add" : "Add");

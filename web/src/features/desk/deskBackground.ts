import type { Store } from "../../lib/storage.ts";

export const BACKGROUND_KEY = "t3-dashboard-desk-background";
// Leaves room for the rest of localStorage (about 5 MB per origin in most browsers).
export const MAX_IMAGE_CHARS = 3_000_000;
export const MAX_IMAGE_SIDE = 1920;
export const TOO_LARGE = "Image is too large to store. Try a smaller one.";

export type BackgroundPresetId = "none" | "ocean" | "forest" | "lagoon" | "lavender" | "sunset" | "rose" | "aurora" | "sand" | "graphite";
export type DeskBackground = { kind: "none" } | { kind: "preset"; id: Exclude<BackgroundPresetId, "none"> } | { kind: "image"; dataUrl: string };

// Gradients live in styles.css (per theme); only the ids and labels are here.
export const BACKGROUND_PRESETS: Array<{ id: BackgroundPresetId; label: string }> = [
  { id: "none", label: "None" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "lagoon", label: "Lagoon" },
  { id: "lavender", label: "Lavender" },
  { id: "sunset", label: "Sunset" },
  { id: "rose", label: "Rose" },
  { id: "aurora", label: "Aurora" },
  { id: "sand", label: "Sand" },
  { id: "graphite", label: "Graphite" },
];

const NONE: DeskBackground = { kind: "none" };
// Old preset ids: a saved one falls back to Sand, the closest gray.
const RETIRED = new Set(["dune", "clay", "sage", "dusk", "linen"]);

export function parseBackground(raw: string | null): DeskBackground {
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return NONE;
  }
  if (typeof data !== "object" || data === null) return NONE;
  const { kind, id, dataUrl } = data as Record<string, unknown>;
  if (kind === "preset" && typeof id === "string" && RETIRED.has(id)) return { kind, id: "sand" };
  if (kind === "preset" && id !== "none" && BACKGROUND_PRESETS.some((p) => p.id === id)) return { kind, id: id as Exclude<BackgroundPresetId, "none"> };
  if (kind === "image" && typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) return { kind, dataUrl };
  return NONE;
}

export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}


export function loadBackground(storage: Store | null): DeskBackground {
  try {
    return parseBackground(storage?.getItem(BACKGROUND_KEY) ?? null);
  } catch {
    return NONE;
  }
}

// Returns an error message, or null when the background was stored.
export function saveBackground(storage: Store | null, background: DeskBackground): string | null {
  if (background.kind === "image" && background.dataUrl.length > MAX_IMAGE_CHARS) return TOO_LARGE;
  try {
    if (!storage) throw new Error("storage is blocked");
    storage.setItem(BACKGROUND_KEY, JSON.stringify(background));
    return null;
  } catch {
    return background.kind === "image" ? TOO_LARGE : "Could not save the background.";
  }
}

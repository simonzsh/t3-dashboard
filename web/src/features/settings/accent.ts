import { LOGO_TILES } from "../../ui/index.ts";
import { readKey, writeKey, type Store } from "../../lib/storage.ts";

export type Accent = "blue" | "purple" | "pink" | "red" | "orange" | "yellow" | "green";

export const ACCENT_KEY = "t3-dashboard-accent";
export const DEFAULT_ACCENT: Accent = "blue";

/** Light and dark values; mirrored in styles.css (`data-accent`). */
export const ACCENTS: { id: Accent; label: string; light: string; dark: string }[] = [
  { id: "blue", label: "Blue", light: "#2563eb", dark: "#3b82f6" },
  { id: "purple", label: "Purple", light: "#7c3aed", dark: "#8b5cf6" },
  { id: "pink", label: "Pink", light: "#db2777", dark: "#ec4899" },
  { id: "red", label: "Red", light: "#dc2626", dark: "#ef4444" },
  { id: "orange", label: "Orange", light: "#ea580c", dark: "#f97316" },
  { id: "yellow", label: "Yellow", light: "#ca8a04", dark: "#eab308" },
  { id: "green", label: "Green", light: "#16a34a", dark: "#22c55e" },
];

export function parseAccent(raw: string | null): Accent {
  return ACCENTS.some((a) => a.id === raw) ? (raw as Accent) : DEFAULT_ACCENT;
}

export const loadAccent = (storage: Store | null): Accent => parseAccent(readKey(storage, ACCENT_KEY));

export const saveAccent = (storage: Store | null, accent: Accent): void => writeKey(storage, ACCENT_KEY, accent);

/** The tab icon: the logo's four tiles in the accent color. */
export function faviconSvg(color: string): string {
  const tiles = LOGO_TILES.map(({ x, y, opacity }) => `<rect x='${x}' y='${y}' width='128' height='128' rx='30' fill='${color}' opacity='${opacity}'/>`).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='104 104 304 304'>${tiles}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

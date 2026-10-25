import { icons } from "lucide";
import type { ProjectIcon } from "../../shared/api.ts";

// T3 names project colors after the Tailwind palette; these are its 500 shades.
const COLORS: Record<string, string> = {
  gray: "#6b7280", red: "#ef4444", orange: "#f97316", amber: "#f59e0b", yellow: "#eab308", lime: "#84cc16",
  green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4", sky: "#0ea5e9", blue: "#3b82f6",
  indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7", fuchsia: "#d946ef", pink: "#ec4899", rose: "#f43f5e",
};

const pascal = (name: string) => name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

type Node = [string, Record<string, string | number>];

/** A Lucide icon as SVG elements the browser can draw; null for an unknown name or kind. */
export function toProjectIcon(raw: { kind?: string | null; name?: string | null; color?: string | null } | null | undefined): ProjectIcon | null {
  if (raw?.kind !== "lucide" || !raw.name) return null;
  const nodes = (icons as Record<string, Node[] | undefined>)[pascal(raw.name)];
  if (!nodes) return null;
  // Only path-like elements with string or number attributes reach the page.
  const shapes = nodes.map(([tag, attrs]) => ({ tag, attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])) }));
  return { shapes, color: COLORS[raw.color ?? ""] ?? null };
}

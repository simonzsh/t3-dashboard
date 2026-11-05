import { icons } from "lucide";
import type { ProjectIcon } from "../../shared/api.ts";
import { PROJECT_COLORS } from "../../shared/projectColors.ts";

const pascal = (name: string) => name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

type Node = [string, Record<string, string | number>];

/** A Lucide icon as SVG elements the browser can draw; null for an unknown name or kind. */
export function toProjectIcon(raw: { kind?: string | null; name?: string | null; color?: string | null } | null | undefined): ProjectIcon | null {
  if (raw?.kind !== "lucide" || !raw.name) return null;
  const nodes = (icons as Record<string, Node[] | undefined>)[pascal(raw.name)];
  if (!nodes) return null;
  // Only path-like elements with string or number attributes reach the page.
  const shapes = nodes.map(([tag, attrs]) => ({ tag, attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])) }));
  return { shapes, color: PROJECT_COLORS[raw.color ?? ""] ?? null };
}

import { icons } from "lucide";
import type { ProjectIcon } from "../../shared/api.ts";
import { PROJECT_COLORS } from "../../shared/projectColors.ts";

const pascal = (name: string) => name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

type Node = [string, Record<string, string | number>];

type RawIcon = { kind?: string | null; name?: string | null; color?: string | null; text?: string | null; emoji?: string | null; monogramText?: string | null; monogram?: string | null };

/** A T3 project icon the browser can draw; null for an unknown kind or Lucide name. */
export function toProjectIcon(raw: RawIcon | null | undefined): ProjectIcon | null {
  if (!raw) return null;
  const color = PROJECT_COLORS[raw.color ?? ""] ?? null;
  // T3 still sends a monogram as a lucide icon with monogramText (or monogram).
  const legacy = raw.kind === "lucide" ? (raw.monogramText ?? raw.monogram) : undefined;
  if (legacy) return { kind: "monogram", text: legacy, color };
  if (raw.kind === "monogram") return raw.text ? { kind: "monogram", text: raw.text, color } : null;
  if (raw.kind === "emoji") return raw.emoji ? { kind: "emoji", emoji: raw.emoji } : null;
  if (raw.kind !== "lucide" || !raw.name) return null;
  const nodes = (icons as Record<string, Node[] | undefined>)[pascal(raw.name)];
  if (!nodes) return null;
  // Only path-like elements with string or number attributes reach the page.
  const shapes = nodes.map(([tag, attrs]) => ({ tag, attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])) }));
  return { kind: "lucide", shapes, color };
}

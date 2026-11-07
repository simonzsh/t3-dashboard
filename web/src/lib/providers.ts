import { monogramColor } from "./monogram.ts";

export type ProviderKind = "claude" | "codex" | "cursor" | "grok" | "opencode" | "antigravity" | "other";
export interface ProviderMeta {
  kind: ProviderKind;
  label: string;
  color: string;
}

// Matched in this order against the lower-cased id. Colours are accents that read on light and dark.
const KNOWN: { kind: Exclude<ProviderKind, "other">; match: string[]; label: string; color: string }[] = [
  { kind: "claude", match: ["claude"], label: "Claude", color: "#d97757" },
  { kind: "codex", match: ["codex"], label: "Codex", color: "currentColor" },
  { kind: "cursor", match: ["cursor"], label: "Cursor", color: "#6366f1" },
  { kind: "grok", match: ["grok"], label: "Grok", color: "#71717a" },
  { kind: "opencode", match: ["opencode"], label: "OpenCode", color: "#0d9488" },
  { kind: "antigravity", match: ["antigravity", "gemini"], label: "Antigravity", color: "#4285f4" },
];

/** `provider` is an instance id or a driver slug; an unknown slug gets a stable generic look. */
export function providerMeta(provider: string): ProviderMeta {
  const id = provider.toLowerCase();
  const known = KNOWN.find((k) => k.match.some((m) => id.includes(m)));
  if (known) return { kind: known.kind, label: known.label, color: known.color };
  return { kind: "other", label: provider, color: monogramColor(provider) };
}

const ORDER: ProviderKind[] = ["codex", "claude", "antigravity", "cursor", "grok", "opencode"];

/** Codex, Claude, then the other known kinds by label, then the unknown ones. */
export function providerRank(provider: string): number {
  const at = ORDER.indexOf(providerMeta(provider).kind);
  return at === -1 ? ORDER.length : at;
}

// html_render pages read T3's theme variables; these map them to the dashboard palette.
const PALETTES = {
  light: { background: "#fefcf8", foreground: "#2b2218", muted: "#f8f4ec", mutedForeground: "#74675a", card: "#f8f4ec", border: "#e8dfcf", accent: "#b5532f", accentForeground: "#ffffff", success: "#4f8f5f", warning: "#c47f0a", destructive: "#b3382b", info: "#4f7f9a", code: "#f0e9dc" },
  dark: { background: "#37322c", foreground: "#ede6da", muted: "#2b2723", mutedForeground: "#b3a998", card: "#2b2723", border: "#4a443c", accent: "#d9825b", accentForeground: "#2b2723", success: "#6fb583", warning: "#e0a030", destructive: "#e0705f", info: "#7fb0c9", code: "#322d28" },
} as const;

export type PageTheme = keyof typeof PALETTES;

export const isPageTheme = (value: string | null): value is PageTheme => value === "light" || value === "dark";

function themeStyle(theme: PageTheme): string {
  const p = PALETTES[theme];
  const vars: Record<string, string> = {
    background: p.background, foreground: p.foreground, muted: p.muted, "muted-foreground": p.mutedForeground,
    card: p.card, "card-foreground": p.foreground, popover: p.card, "popover-foreground": p.foreground,
    secondary: p.muted, "secondary-foreground": p.foreground, border: p.border, input: p.border, ring: p.accent,
    primary: p.accent, "primary-foreground": p.accentForeground, accent: p.accent, "accent-foreground": p.accentForeground,
    "accent-surface": p.muted, "accent-surface-foreground": p.foreground, destructive: p.destructive, "destructive-foreground": "#ffffff",
    "destructive-surface": p.muted, warning: p.warning, "warning-foreground": p.foreground, "warning-surface": p.muted,
    success: p.success, "success-foreground": p.foreground, info: p.info, "info-foreground": p.foreground,
    "code-background": p.code, "code-foreground": p.foreground,
    "chart-1": p.accent, "chart-2": p.info, "chart-3": p.success, "chart-4": p.warning, "chart-5": p.destructive, "chart-6": p.mutedForeground,
    radius: "10px", "font-sans": "ui-sans-serif, system-ui, sans-serif", "font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  };
  const declarations = Object.entries(vars).map(([name, value]) => `--${name}: ${value};`).join(" ");
  return `<style>:root { ${declarations} color-scheme: ${theme}; } html { background: transparent; color: var(--foreground); font-family: var(--font-sans); } body { margin: 0; } ::-webkit-scrollbar { display: none; }</style>`;
}

/** Puts the theme first, so the page's own styles still win. */
export function themedPage(html: string, theme: PageTheme): string {
  const style = themeStyle(theme);
  const head = /<head(\s[^>]*)?>/i.exec(html);
  return head ? html.slice(0, head.index + head[0].length) + style + html.slice(head.index + head[0].length) : style + html;
}

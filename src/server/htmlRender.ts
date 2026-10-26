// html_render pages read T3's theme variables; these map them to the dashboard palette.
const PALETTES = {
  light: { background: "#ffffff", foreground: "#313338", muted: "#f2f3f5", mutedForeground: "#5c5e66", card: "#f2f3f5", border: "#d4d7dc", accent: "#4752c4", accentForeground: "#ffffff", success: "#248046", warning: "#b57a00", destructive: "#da373c", info: "#0b72b8", code: "#e3e5e8" },
  dark: { background: "#313338", foreground: "#dbdee1", muted: "#2b2d31", mutedForeground: "#949ba4", card: "#2b2d31", border: "#3f4147", accent: "#5865f2", accentForeground: "#ffffff", success: "#23a559", warning: "#f0b232", destructive: "#f23f43", info: "#00a8fc", code: "#1e1f22" },
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

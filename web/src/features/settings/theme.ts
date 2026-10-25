import type { Store } from "../../lib/storage.ts";

export type ThemeSetting = "system" | "light" | "dark";

export const THEME_KEY = "t3-dashboard-theme";
export const THEME_SETTINGS: ThemeSetting[] = ["system", "light", "dark"];

export function parseTheme(raw: string | null): ThemeSetting {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): "light" | "dark" {
  if (setting === "system") return prefersDark ? "dark" : "light";
  return setting;
}

// Storage can throw (private mode, blocked cookies): the theme then just resets on reload.
export function loadTheme(storage: Store | null): ThemeSetting {
  try {
    return parseTheme(storage?.getItem(THEME_KEY) ?? null);
  } catch {
    return "system";
  }
}

export function saveTheme(storage: Store | null, setting: ThemeSetting): void {
  try {
    storage?.setItem(THEME_KEY, setting);
  } catch {
    // Ignored on purpose: see loadTheme.
  }
}

import { readKey, writeKey, type Store } from "../../lib/storage.ts";

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

export const loadTheme = (storage: Store | null): ThemeSetting => parseTheme(readKey(storage, THEME_KEY));

export const saveTheme = (storage: Store | null, setting: ThemeSetting): void => writeKey(storage, THEME_KEY, setting);

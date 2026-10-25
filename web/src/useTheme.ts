import { useEffect, useState } from "react";
import { loadTheme, resolveTheme, saveTheme, type ThemeSetting } from "./theme.ts";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function useTheme(): [ThemeSetting, (setting: ThemeSetting) => void] {
  const [setting, setSetting] = useState<ThemeSetting>(() => loadTheme(localStorage));

  // data-theme always holds the resolved value; "system" is re-resolved when the OS changes.
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const apply = () => document.documentElement.setAttribute("data-theme", resolveTheme(setting, query.matches));
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [setting]);

  return [
    setting,
    (next) => {
      saveTheme(localStorage, next);
      setSetting(next);
    },
  ];
}

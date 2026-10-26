export type Browser = "chromium" | "safari" | "firefox" | "other";

export type InstallView = "installed" | "prompt" | "chromium" | "safari" | "firefox" | "other";

// Chromium browsers (Edge, Arc, Brave...) all carry "Chrome/" in their user agent.
export function detectBrowser(userAgent: string): Browser {
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "firefox";
  if (/Chrome\/|Chromium\/|CriOS\//.test(userAgent)) return "chromium";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

interface State {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  browser: Browser;
}

/** What the App tab shows: the native prompt when the browser gave one, else how to install by hand. */
export function installView({ standalone, installed, canPrompt, browser }: State): InstallView {
  if (standalone || installed) return "installed";
  if (canPrompt) return "prompt";
  return browser === "other" ? "other" : browser;
}

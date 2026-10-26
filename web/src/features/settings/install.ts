export type Browser = "chromium" | "safari" | "firefox" | "ios" | "other";

export type InstallView = "installed" | "prompt" | Browser;

// Chromium browsers (Edge, Arc, Brave...) all carry "Chrome/" in their user agent.
// Every iOS browser runs on WebKit and can only add to the home screen.
export function detectBrowser(userAgent: string): Browser {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
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
  return browser;
}

export const INSTALL_NOTES: Record<Exclude<InstallView, "prompt">, string> = {
  installed: "Installed. Open it from your Dock, Launchpad or Start menu.",
  chromium: "This browser does not offer to install apps. Open this page in Chrome or Edge and click Install app, or in Safari choose File > Add to Dock.",
  safari: "In the menu bar, choose File > Add to Dock.",
  ios: "Tap Share, then Add to Home Screen.",
  firefox: "Firefox does not install web apps. Open this page in Chrome or Edge and click Install app, or in Safari choose File > Add to Dock.",
  other: "Open this page in Chrome or Edge and click Install app, or in Safari choose File > Add to Dock.",
};

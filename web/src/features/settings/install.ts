export type Browser = "chromium" | "safari" | "firefox" | "ios" | "android" | "other";

export type InstallView = "installed" | "prompt" | Browser;

// Every iOS browser runs on WebKit; iPadOS Safari poses as a Mac, so touch points tell them apart.
// Chromium browsers (Edge, Arc, Dia, Brave...) all carry "Chrome/" in their user agent.
export function detectBrowser(userAgent: string, touchPoints = 0): Browser {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "firefox";
  if (/Chrome\/|Chromium\/|CriOS\//.test(userAgent)) return "chromium";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

export const isMac = (userAgent: string) => /Macintosh/.test(userAgent);

interface State {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  browser: Browser;
}

/** What to offer: the native prompt when the browser gave one, else how to install by hand. */
export function installView({ standalone, installed, canPrompt, browser }: State): InstallView {
  if (standalone || installed) return "installed";
  if (canPrompt) return "prompt";
  return browser;
}

const ELSEWHERE = "Open this page in Chrome or Edge and click Install app.";

/** The steps for this device, one per line. */
export function installSteps(view: Exclude<InstallView, "prompt">, mac: boolean): string[] {
  const safari = mac ? ["On a Mac, Safari works too: File > Add to Dock."] : [];
  switch (view) {
    case "installed":
      return [mac ? "Installed. Open it from the Dock or Launchpad." : "Installed. Open it from the Start menu or the taskbar."];
    case "ios":
      return ["Tap the Share button.", "Choose Add to Home Screen."];
    case "android":
      return ["Open the browser menu (⋮).", "Choose Install app or Add to Home screen."];
    case "safari":
      return ["In the menu bar, choose File > Add to Dock."];
    case "chromium":
      return ["This browser does not install web apps.", ELSEWHERE, ...safari];
    case "firefox":
      return ["Firefox does not install web apps.", ELSEWHERE, ...safari];
    case "other":
      return [ELSEWHERE, ...safari];
  }
}

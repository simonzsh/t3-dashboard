export type Browser = "chrome" | "edge" | "safari" | "firefox" | "ios" | "android" | "other";

interface Client {
  userAgent: string;
  touchPoints?: number;
  /** navigator.userAgentData brands: the only way to tell Chrome from Dia, Arc or Brave. */
  brands?: string[];
}

// Every iOS browser runs on WebKit; iPadOS Safari poses as a Mac, so touch points tell them apart.
export function detectBrowser({ userAgent, touchPoints = 0, brands = [] }: Client): Browser {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Edg\//.test(userAgent)) return "edge";
  if (brands.includes("Google Chrome")) return "chrome";
  if (/Chrome\//.test(userAgent)) return "other";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

/** The steps for this browser, one per line. */
export function installSteps(browser: Browser, mac: boolean): string[] {
  switch (browser) {
    case "ios":
      return ["Tap the Share button.", "Choose Add to Home Screen."];
    case "android":
      return ["Open the browser menu (⋮).", "Choose Add to Home screen."];
    case "safari":
      return ["In the menu bar, choose File > Add to Dock."];
    case "chrome":
      return ["Open the Chrome menu (⋮).", "Choose Cast, save and share > Install page as app."];
    case "edge":
      return ["Open the Edge menu (…).", "Choose Apps > Install this site as an app."];
    case "firefox":
    case "other":
      return [`This browser cannot install web apps. Open the dashboard in ${mac ? "Safari or Chrome" : "Chrome or Edge"}.`];
  }
}

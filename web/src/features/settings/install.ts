export type Device = "ios" | "android" | "desktop";

export const TAILSCALE_DOWNLOAD = "https://tailscale.com/download";

// Every iOS browser runs on WebKit; iPadOS Safari poses as a Mac, so touch points tell them apart.
export function detectDevice({ userAgent, touchPoints = 0 }: { userAgent: string; touchPoints?: number }): Device {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}

export function phoneStep(device: "ios" | "android"): string {
  return device === "ios" ? "Tap Share, then Add to Home Screen." : "Open the browser menu (⋮), then choose Add to Home screen.";
}

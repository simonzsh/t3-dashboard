import icon192 from "./pwa/icon-192.png" with { type: "file" };
import icon512 from "./pwa/icon-512.png" with { type: "file" };
import iconMaskable from "./pwa/icon-maskable-512.png" with { type: "file" };
import iconSvg from "./pwa/icon.svg" with { type: "file" };

// Fixed URLs, served by our own fetch: the bundler would hash the names, and the
// service worker must sit at the root to control the whole app.
const MANIFEST = {
  id: "/",
  name: "T3 Dashboard",
  short_name: "T3 Dashboard",
  start_url: "/",
  scope: "/",
  display: "standalone",
  theme_color: "#f8f4ec",
  background_color: "#f8f4ec",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
};

// Pass-through only: Chromium wants a fetch handler to offer the install, and offline use is out of scope.
const WORKER = `self.addEventListener("fetch", () => {});\n`;

const ICONS: Record<string, { path: string; type: string }> = {
  "/icons/icon-192.png": { path: icon192, type: "image/png" },
  "/icons/icon-512.png": { path: icon512, type: "image/png" },
  "/icons/icon-maskable-512.png": { path: iconMaskable, type: "image/png" },
  "/icons/icon.svg": { path: iconSvg, type: "image/svg+xml" },
};

/** The manifest, the service worker and the app icons; null for any other path. */
export function servePwa(pathname: string): Response | null {
  if (pathname === "/manifest.webmanifest") return new Response(JSON.stringify(MANIFEST), { headers: { "content-type": "application/manifest+json" } });
  // no-cache: a new worker must reach the browsers on the next visit.
  if (pathname === "/sw.js") return new Response(WORKER, { headers: { "content-type": "text/javascript;charset=utf-8", "cache-control": "no-cache" } });
  const icon = ICONS[pathname];
  return icon ? new Response(Bun.file(icon.path), { headers: { "content-type": icon.type } }) : null;
}

import { basename, extname } from "node:path";
import type { HTMLBundle } from "bun";

export interface Site {
  /** Set when running from source: Bun serves the page itself, with hot reload. */
  devRoutes?: Record<string, HTMLBundle>;
  serve(pathname: string): Promise<Response | null>;
}

interface BundleFile {
  path: string;
  headers: Record<string, string>;
}

/** Serves the files of a compiled HTML import through our own fetch, so the security headers apply. */
export function siteFromBundle(bundle: HTMLBundle): Site {
  const files = (bundle as HTMLBundle & { files?: BundleFile[] }).files;
  if (!files) return { devRoutes: { "/": bundle }, serve: async () => null };
  const byName = new Map(files.map((file) => [basename(file.path), file]));
  const page = files.find((file) => file.path.endsWith(".html"));
  const respond = (file: BundleFile) => new Response(Bun.file(file.path), { headers: file.headers });
  // Safari asks for /favicon.ico whatever the page links: answer with the bundled PNG icon.
  const icon = files.find((file) => basename(file.path).startsWith("favicon-32"));
  return {
    async serve(pathname) {
      if (pathname === "/favicon.ico" && icon) return respond(icon);
      const asset = byName.get(basename(pathname));
      // Pages without an extension fall back to the app shell (client-side routes).
      if (asset && pathname !== "/" && asset !== page) return respond(asset);
      return page && extname(pathname) === "" ? respond(page) : null;
    },
  };
}

import { basename, extname } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import type { HTMLBundle } from "bun";
import { matchesEtag } from "./etag.ts";

export interface Site {
  /** Set when running from source: Bun serves the page itself, with hot reload. */
  devRoutes?: Record<string, HTMLBundle>;
  serve(pathname: string, req: Request): Promise<Response | null>;
}

interface BundleFile {
  path: string;
  headers: Record<string, string>;
}

type Encoding = "br" | "gzip";

interface Variant {
  body: Uint8Array<ArrayBuffer>;
  etag: string;
}

interface Entry {
  type: string;
  identity: Variant;
  br?: Variant;
  gzip?: Variant;
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const TEXT_TYPE = /^text\/|javascript|json|xml|svg/i;
const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/** The best encoding the client accepts: br, then gzip. A missing header means identity. */
export function pickEncoding(header: string | null): Encoding | null {
  if (!header) return null;
  const weights = new Map<string, number>();
  for (const part of header.split(",")) {
    const [name = "", ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
    weights.set(name.trim(), q ? Number(q.slice(2)) : 1);
  }
  const accepts = (name: string) => (weights.get(name) ?? weights.get("*") ?? 0) > 0;
  if (accepts("br")) return "br";
  return accepts("gzip") ? "gzip" : null;
}

async function prepare(file: BundleFile): Promise<Entry> {
  const bytes = await Bun.file(file.path).bytes();
  const hash = Bun.hash(bytes).toString(36);
  const type = file.headers["content-type"] ?? "application/octet-stream";
  const entry: Entry = { type, identity: { body: bytes, etag: `"${hash}"` } };
  if (!TEXT_TYPE.test(type)) return entry;
  const [zipped, brotli] = await Promise.all([
    gzipAsync(bytes, { level: 9 }),
    brotliAsync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }),
  ]);
  // A variant that does not shrink the file only costs the client a decode.
  if (brotli.length < bytes.length) entry.br = { body: brotli, etag: `"${hash}-br"` };
  if (zipped.length < bytes.length) entry.gzip = { body: zipped, etag: `"${hash}-gz"` };
  return entry;
}

/** Serves the files of a compiled HTML import through our own fetch, so the security headers apply. */
export function siteFromBundle(bundle: HTMLBundle): Site {
  const files = (bundle as HTMLBundle & { files?: BundleFile[] }).files;
  if (!files) return { devRoutes: { "/": bundle }, serve: async () => null };
  // Starts at once without blocking listen; a failed read shows on the first request for the file.
  const entries = new Map<BundleFile, Promise<Entry>>(files.map((file) => [file, prepare(file)]));
  for (const entry of entries.values()) entry.catch(() => {});
  const byName = new Map(files.map((file) => [basename(file.path), file]));
  const page = files.find((file) => file.path.endsWith(".html"));
  // Safari asks for /favicon.ico whatever the page links: answer with the bundled PNG icon.
  const icon = files.find((file) => basename(file.path).startsWith("favicon-32"));

  async function respond(file: BundleFile, req: Request, cacheControl: string): Promise<Response> {
    const entry = await entries.get(file)!;
    const encoding = pickEncoding(req.headers.get("accept-encoding"));
    const encoded = encoding === "br" ? entry.br : encoding === "gzip" ? entry.gzip : undefined;
    const variant = encoded ?? entry.identity;
    const headers: Record<string, string> = { "content-type": entry.type, etag: variant.etag, "cache-control": cacheControl };
    if (entry.br || entry.gzip) headers.vary = "accept-encoding";
    if (matchesEtag(req.headers.get("if-none-match"), variant.etag)) return new Response(null, { status: 304, headers });
    if (encoded) headers["content-encoding"] = encoding!;
    return new Response(variant.body, { headers });
  }

  return {
    async serve(pathname, req) {
      if (pathname === "/favicon.ico" && icon) return respond(icon, req, "public, max-age=86400");
      const asset = byName.get(basename(pathname));
      // Pages without an extension fall back to the app shell (client-side routes).
      if (asset && pathname !== "/" && asset !== page) return respond(asset, req, IMMUTABLE);
      return page && extname(pathname) === "" ? respond(page, req, "no-cache") : null;
    },
  };
}

import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { pickEncoding } from "./site.ts";

// Under this size the savings do not pay for the CPU and the decode.
const MIN_COMPRESS_BYTES = 1024;
const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/** Compresses a JSON answer for a client that accepts it. Streams, partial answers, 304s and HEAD pass through unread. */
export async function compressJson(req: Request, res: Response): Promise<Response> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json") || res.headers.has("content-encoding") || res.status === 206 || res.headers.has("content-range") || res.body === null || req.method === "HEAD") return res;
  const encoding = pickEncoding(req.headers.get("accept-encoding"));
  const bytes = new Uint8Array(await res.arrayBuffer());
  const headers = new Headers(res.headers);
  headers.set("vary", "accept-encoding");
  headers.delete("content-length");
  let body: Uint8Array = bytes;
  if (encoding && bytes.length >= MIN_COMPRESS_BYTES) {
    // Quality 4 keeps brotli close to gzip's speed: this runs on every poll.
    body = encoding === "br" ? await brotliAsync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }) : await gzipAsync(bytes, { level: 6 });
    headers.set("content-encoding", encoding);
  }
  return new Response(body as Uint8Array<ArrayBuffer>, { status: res.status, statusText: res.statusText, headers });
}

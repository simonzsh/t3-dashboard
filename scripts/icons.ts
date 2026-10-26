import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// Draws the star: writes the SVG source, the PNGs of the web app manifest and the web favicons.
const OUT = join(import.meta.dir, "..", "src", "server", "pwa");
const WEB = join(import.meta.dir, "..", "web");
const BACKGROUND = "#1e1f22";
const RAY = "#5865f2";
const ANGLES = [0, 32, 70, 105, 140, 180, 215, 250, 290, 325];
// On a 512 canvas: rays run from radius INNER to OUTER with round ends of WIDTH.
const [INNER, OUTER, WIDTH] = [54, 131, 34];
// A maskable icon keeps its art inside the central 80% circle: the OS crops the rest.
const MASKABLE_SCALE = 0.9;

const hex = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

function svg(): string {
  const rays = ANGLES.map((angle) => `    <line x1="256" y1="${256 - OUTER}" x2="256" y2="${256 - INNER}" transform="rotate(${angle} 256 256)"/>`);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    `  <rect width="512" height="512" fill="${BACKGROUND}"/>`,
    `  <g stroke="${RAY}" stroke-width="${WIDTH}" stroke-linecap="round">`,
    ...rays,
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}

/** Distance from a point to a segment. */
function distance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

function raster(size: number, scale: number): Buffer {
  const k = size / 512;
  const segments = ANGLES.map((angle) => {
    const rad = (angle * Math.PI) / 180;
    const at = (r: number) => [256 + Math.sin(rad) * r * scale, 256 - Math.cos(rad) * r * scale] as const;
    return [at(INNER), at(OUTER)] as const;
  });
  const [bg, ray] = [hex(BACKGROUND), hex(RAY)];
  const rows: Buffer[] = [];
  const SUB = 4;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      let covered = 0;
      for (let sy = 0; sy < SUB; sy++)
        for (let sx = 0; sx < SUB; sx++) {
          const px = (x + (sx + 0.5) / SUB) / k;
          const py = (y + (sy + 0.5) / SUB) / k;
          if (segments.some(([a, b]) => distance(px, py, a[0], a[1], b[0], b[1]) <= (WIDTH * scale) / 2)) covered++;
        }
      const mix = covered / (SUB * SUB);
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(bg[c]! + (ray[c]! - bg[c]!) * mix);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, body, tail]);
}

function png(size: number, raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(join(OUT, "icon.svg"), svg());
writeFileSync(join(OUT, "icon-192.png"), raster(192, 1));
writeFileSync(join(OUT, "icon-512.png"), raster(512, 1));
writeFileSync(join(OUT, "icon-maskable-512.png"), raster(512, MASKABLE_SCALE));
writeFileSync(join(WEB, "favicon-32.png"), raster(32, 1));
writeFileSync(join(WEB, "apple-touch-icon.png"), raster(180, 1));

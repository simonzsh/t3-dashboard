import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// Draws the Desk logo: four windows, one active. Writes the SVG source, the PNGs of the web app manifest and the web favicons.
const OUT = join(import.meta.dir, "..", "src", "server", "pwa");
const WEB = join(import.meta.dir, "..", "web");
const LIGHT = "#ffffff";
const DARK = "#000000";
const ACCENT = "#5865f2";
// On a 512 canvas: the top-left window is the active one, the others are faded.
const TILES = [
  { x: 112, y: 112, opacity: 1 },
  { x: 272, y: 112, opacity: 0.35 },
  { x: 112, y: 272, opacity: 0.35 },
  { x: 272, y: 272, opacity: 0.65 },
];
const [SIZE, RADIUS] = [128, 30];
// A maskable icon keeps its art inside the central 80% circle: the OS crops the rest.
const MASKABLE_SCALE = 0.85;

const hex = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

// The background follows the color scheme of the browser or the OS.
function svg(): string {
  const tiles = TILES.map(({ x, y, opacity }) => `  <rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="${ACCENT}"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    `  <style>.bg { fill: ${LIGHT}; } @media (prefers-color-scheme: dark) { .bg { fill: ${DARK}; } }</style>`,
    '  <rect class="bg" width="512" height="512"/>',
    ...tiles,
    "</svg>",
    "",
  ].join("\n");
}

/** True when the point is inside the rounded square. */
function inside(px: number, py: number, x: number, y: number, size: number, radius: number): boolean {
  const dx = Math.max(x + radius - px, 0, px - (x + size - radius));
  const dy = Math.max(y + radius - py, 0, py - (y + size - radius));
  return px >= x && px <= x + size && py >= y && py <= y + size && dx * dx + dy * dy <= radius * radius;
}

function raster(size: number, scale: number, background: string): Buffer {
  const k = size / 512;
  const at = (v: number) => 256 + (v - 256) * scale;
  const [bg, accent] = [hex(background), hex(ACCENT)];
  const rows: Buffer[] = [];
  const SUB = 4;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      let mix = 0;
      for (let sy = 0; sy < SUB; sy++)
        for (let sx = 0; sx < SUB; sx++) {
          const px = (x + (sx + 0.5) / SUB) / k;
          const py = (y + (sy + 0.5) / SUB) / k;
          const tile = TILES.find((t) => inside(px, py, at(t.x), at(t.y), SIZE * scale, RADIUS * scale));
          if (tile) mix += tile.opacity;
        }
      mix /= SUB * SUB;
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(bg[c]! + (accent[c]! - bg[c]!) * mix);
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
// Installed app icons cannot follow the color scheme: they use the dark background.
writeFileSync(join(OUT, "icon-192.png"), raster(192, 1, DARK));
writeFileSync(join(OUT, "icon-512.png"), raster(512, 1, DARK));
writeFileSync(join(OUT, "icon-maskable-512.png"), raster(512, MASKABLE_SCALE, DARK));
writeFileSync(join(WEB, "apple-touch-icon.png"), raster(180, 1, DARK));
writeFileSync(join(WEB, "favicon-32.png"), raster(32, 1, LIGHT));
writeFileSync(join(WEB, "favicon-dark-32.png"), raster(32, 1, DARK));

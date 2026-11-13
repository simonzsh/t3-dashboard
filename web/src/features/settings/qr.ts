import { encode } from "uqr";

const QUIET = 4; // modules of white border that scanners need

/** One SVG path that draws every dark module, and the viewBox size with the quiet zone. */
export function qrPath(text: string): { size: number; d: string } {
  const { data } = encode(text, { ecc: "M", border: 0 });
  let d = "";
  data.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`; }));
  return { size: data.length + 2 * QUIET, d };
}

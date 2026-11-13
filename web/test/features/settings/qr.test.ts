import { test } from "bun:test";
import assert from "node:assert/strict";
import { qrPath } from "../../../src/features/settings/qr.ts";

test("qrPath adds a 4 module quiet zone on each side", () => {
  const { size, d } = qrPath("https://box.tail.ts.net:4300");
  // Version 2 to 4 symbols are 25 to 33 modules wide at level M for this text.
  assert.ok(size - 8 >= 21 && (size - 8 - 17) % 4 === 0, `size ${size} is a valid symbol plus 8`);
  assert.ok(d.startsWith("M4 4"), "the finder pattern starts at the corner of the symbol");
  assert.match(d, /^(M\d+ \d+h1v1h-1z)+$/);
});

test("qrPath is deterministic and grows with the text", () => {
  assert.equal(qrPath("https://box.tail.ts.net").d, qrPath("https://box.tail.ts.net").d);
  assert.ok(qrPath("https://box.tail.ts.net/" + "a".repeat(120)).size > qrPath("https://box.tail.ts.net").size);
});

import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../../src/features/conversation/QueuedMessages.tsx", import.meta.url), "utf8");

test("queued message editing uses the composer's Enter policy and prevents a newline before saving", () => {
  assert.match(source, /import \{ isSendKey \} from "\.\/composer\.ts"/);
  assert.match(source, /const touch = useMediaQuery\(TOUCH\)/);
  assert.match(source, /if \(isSendKey\(\{ key: e\.key, shiftKey: e\.shiftKey, isComposing: e\.nativeEvent\.isComposing \}, touch\)\) \{\s*e\.preventDefault\(\);\s*void save\(\);/);
});

test("keyboard saves cannot submit an empty draft or save during an update", () => {
  assert.match(source, /const save = async \(\) => \{\s*if \(busy \|\| draft\.trim\(\) === ""\) return;/);
});

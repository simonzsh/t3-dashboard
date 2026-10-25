import assert from "node:assert/strict";
import { test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Password managers (Safari, 1Password…) pop up on fields that look like a login: guard every field.
const root = join(import.meta.dir, "../src");
const sources = readdirSync(root, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));

const tags = (text: string, tag: string) => [...text.matchAll(new RegExp(`<${tag}\\b[^>]*?/?>`, "gs"))].map((m) => m[0]);

test("no password input anywhere", () => {
  for (const { file, text } of sources) assert.ok(!text.includes('type="password"'), file);
});

test("every text field and form turns autofill off", () => {
  for (const { file, text } of sources) {
    const fields = [...tags(text, "textarea"), ...tags(text, "form"), ...tags(text, "input").filter((t) => !/type=(\{[^}]*\}|"(checkbox|radio|file)")/.test(t))];
    for (const field of fields) assert.match(field, /autoComplete="off"|\{\.\.\.NO_AUTOFILL\}|\{\.\.\.SECRET_FIELD\}/, `${file}: ${field.slice(0, 80)}`);
  }
});

test("no field label hints at a login", () => {
  for (const { file, text } of sources) {
    for (const field of ["input", "textarea", "TextInput", "TextArea", "SecretInput"].flatMap((tag) => tags(text, tag))) {
      assert.ok(!/(placeholder|aria-label|name|id)="[^"]*(password|email|user|login|token)/i.test(field), `${file}: ${field.slice(0, 80)}`);
    }
  }
});

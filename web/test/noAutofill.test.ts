import assert from "node:assert/strict";
import { test } from "bun:test";
import { tsxSources } from "./fixtures.ts";

// Password managers (Safari, 1Password…) pop up on fields that look like a login: guard every field.
const sources = tsxSources();

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

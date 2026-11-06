import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AddProjectDialog } from "../../../src/features/projects/AddProjectDialog.tsx";

const html = renderToStaticMarkup(<AddProjectDialog onClose={() => {}} onCreated={() => {}} />);

test("the form starts at ~/ with the primary Add button, Cancel on the left", () => {
  assert.match(html, /<h2[^>]*>Add project<\/h2>/);
  assert.match(html, /<input[^>]*value="~\/"/);
  assert.ok(html.indexOf(">Cancel<") < html.indexOf(">Add<"));
  assert.doesNotMatch(html, /Create &amp; Add|role="alert"|does not exist/);
});

test("the title field shows the folder name as placeholder and is empty", () => {
  assert.match(html, /<input[^>]*placeholder="project"[^>]*value=""|<input[^>]*value=""[^>]*placeholder="project"/);
});

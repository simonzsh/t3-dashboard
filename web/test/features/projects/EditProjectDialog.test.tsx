import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardProject } from "../../../../shared/api.ts";
import { DeleteProjectDialog } from "../../../src/features/projects/DeleteProjectDialog.tsx";
import { EditProjectDialog } from "../../../src/features/projects/EditProjectDialog.tsx";
import { IconPicker } from "../../../src/features/projects/IconPicker.tsx";

const project: DashboardProject = {
  id: "p1",
  title: "Shop",
  defaultModelSelection: null,
  icon: null,
  workspaceRoot: "/home/u/shop",
  iconSpec: { kind: "lucide", name: "rocket", color: "teal" },
};
const noop = () => {};

test("the edit form is prefilled, has no folder field, and Save is disabled until something changes", () => {
  const html = renderToStaticMarkup(<EditProjectDialog project={project} onClose={noop} />);
  assert.match(html, /<h2[^>]*>Edit project<\/h2>/);
  assert.match(html, /<input[^>]*value="Shop"/);
  assert.doesNotMatch(html, /Folder|\/home\/u\/shop/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save</);
  assert.ok(html.indexOf(">Cancel<") < html.indexOf(">Save<"));
  assert.doesNotMatch(html, /role="alert"/);
});

test("the icon picker has four types and the 18 colors; the current color is pressed", () => {
  const html = renderToStaticMarkup(<IconPicker title="Shop" value={project.iconSpec!} onChange={noop} />);
  for (const label of ["Icons", "Emoji", "Monogram", "Default"]) assert.match(html, new RegExp(`role="radio"[^>]*>${label}<`));
  assert.equal(html.match(/class="icon-swatch"/g)?.length, 18);
  assert.match(html, /aria-label="teal" aria-pressed="true"/);
  assert.match(html, /aria-label="red" aria-pressed="false"/);
});

test("with no icon the picker starts on Icons with the title's color and no icon pressed", () => {
  const html = renderToStaticMarkup(<IconPicker title="Shop" value={null} onChange={noop} />);
  assert.match(html, /aria-checked="true"[^>]*>Icons</);
  assert.doesNotMatch(html, /icon-choice[^>]*aria-pressed="true"/);
  assert.equal(html.match(/class="icon-swatch"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*class="icon-swatch"/g)?.length ?? 0, 1);
});

test("a monogram icon opens the Monogram tab with its text", () => {
  const html = renderToStaticMarkup(<IconPicker title="Shop" value={{ kind: "monogram", text: "SH", color: "red" }} onChange={noop} />);
  assert.match(html, /aria-checked="true"[^>]*>Monogram</);
  assert.match(html, /<input[^>]*aria-label="Monogram"[^>]*value="SH"|<input[^>]*value="SH"[^>]*aria-label="Monogram"/);
});

test("an emoji icon opens the Emoji tab with the 30 presets and no swatches", () => {
  const html = renderToStaticMarkup(<IconPicker title="Shop" value={{ kind: "emoji", emoji: "🚀" }} onChange={noop} />);
  assert.match(html, /aria-label="Rocket" aria-pressed="true"/);
  assert.equal(html.match(/class="icon-choice"/g)?.length, 30);
  assert.doesNotMatch(html, /class="icon-swatch"/);
});

test("the delete dialog states the session count and that the folder stays", () => {
  const many = renderToStaticMarkup(<DeleteProjectDialog project={project} sessions={3} onClose={noop} />);
  assert.match(many, /<h2[^>]*>Delete project\?<\/h2>/);
  assert.match(many, /Delete &quot;Shop&quot; and its 3 sessions\?/);
  assert.match(many, /The folder stays on disk\./);
  assert.match(many, /class="btn md danger">Delete</);
  assert.match(renderToStaticMarkup(<DeleteProjectDialog project={project} sessions={1} onClose={noop} />), /its 1 session\?/);
  assert.match(renderToStaticMarkup(<DeleteProjectDialog project={project} sessions={0} onClose={noop} />), /Delete &quot;Shop&quot;\?/);
});

import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PROJECT_COLORS, PROJECT_COLOR_NAMES } from "../../../shared/projectColors.ts";
import { ProjectTag } from "../../src/lib/ProjectTag.tsx";
import { ProjectIcon } from "../../src/lib/ProjectIcon.tsx";
import { monogramColor, monogramText } from "../../src/lib/monogram.ts";

test("the text falls back to PR when the title has no letter or digit", () => {
  assert.equal(monogramText(""), "PR");
  assert.equal(monogramText("  --- "), "PR");
});

test("a one-word title gives its first and last letters", () => {
  assert.equal(monogramText("andy"), "AY");
});

test("a multi-word title gives the first letter and the last word's initial", () => {
  assert.equal(monogramText("Project A"), "PA");
  assert.equal(monogramText("my cool app"), "MA");
});

test("a digit after the first character wins", () => {
  assert.equal(monogramText("Web2 app"), "W2");
});

test("the color is a stable pick from the palette, case-insensitive", () => {
  assert.equal(monogramColor("Project"), PROJECT_COLORS.fuchsia);
  assert.equal(monogramColor("ANDY"), PROJECT_COLORS.orange);
  assert.equal(monogramColor("Project A"), PROJECT_COLORS.green);
  assert.equal(monogramColor("Web2"), PROJECT_COLORS.teal);
  assert.equal(monogramColor(""), PROJECT_COLORS.fuchsia);
});

test("a project with no icon still shows a monogram mark", () => {
  const out = renderToStaticMarkup(<ProjectIcon icon={null} title="Project A" />);
  assert.match(out, /class="project-icon"/);
  assert.match(out, />PA<\/text>/);
  assert.match(out, /textLength="12"/);
  assert.match(out, new RegExp(`color:${PROJECT_COLORS.green}`));
});

test("the ordered names and the color map hold the same 18 colors", () => {
  assert.deepEqual([...PROJECT_COLOR_NAMES].sort(), Object.keys(PROJECT_COLORS).sort());
});

test("a tag with noIcon draws no mark", () => {
  const out = renderToStaticMarkup(<ProjectTag icon={null} title="Project A" noIcon />);
  assert.doesNotMatch(out, /<svg/);
});

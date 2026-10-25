import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectPicker } from "../../src/lib/ProjectPicker.tsx";

const project = { id: "p1", title: "Project A", defaultModelSelection: null };

test("without projects the picker is disabled and says so", () => {
  const out = renderToStaticMarkup(<ProjectPicker label="Project" projects={[]} value="" onPick={() => {}} />);
  assert.match(out, /No T3 project yet/);
  assert.match(out, /disabled=""/);
});

test("with projects the picker asks for one, then shows the chosen one", () => {
  assert.match(renderToStaticMarkup(<ProjectPicker label="Project" projects={[project]} value="" onPick={() => {}} />), /Choose a project…/);
  assert.match(renderToStaticMarkup(<ProjectPicker label="Project" projects={[project]} value="p1" onPick={() => {}} />), /Project A/);
});

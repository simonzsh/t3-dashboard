import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NEW_PROJECT_OPTION, ProjectPicker, pickerHandlers, pickerOptions } from "../../src/lib/ProjectPicker.tsx";

const project = { id: "p1", title: "Project A", defaultModelSelection: null, icon: null };

test("without projects the picker is disabled and says so", () => {
  const out = renderToStaticMarkup(<ProjectPicker label="Project" projects={[]} value="" onPick={() => {}} />);
  assert.match(out, /No T3 project yet/);
  assert.match(out, /disabled=""/);
});

test("with projects the picker asks for one, then shows the chosen one", () => {
  assert.match(renderToStaticMarkup(<ProjectPicker label="Project" projects={[project]} value="" onPick={() => {}} />), /Choose a project…/);
  assert.match(renderToStaticMarkup(<ProjectPicker label="Project" projects={[project]} value="p1" onPick={() => {}} />), /Project A/);
});

test("with onNewProject the options end with New project…, without it they do not", () => {
  const b = { ...project, id: "p0", title: "Beta" };
  assert.deepEqual(pickerOptions([b, project], true).map((o) => [o.id, o.label]), [["p0", "Beta"], ["p1", "Project A"], [NEW_PROJECT_OPTION, "New project…"]]);
  assert.deepEqual(pickerOptions([project], false).map((o) => o.id), ["p1"]);
});

test("picking New project… calls onNewProject, never onPick or onPicked", () => {
  const calls: string[] = [];
  const handlers = pickerHandlers({ onPick: (id) => calls.push(`pick ${id}`), onPicked: () => calls.push("picked"), onNewProject: () => calls.push("new") });
  handlers.onPick(NEW_PROJECT_OPTION);
  handlers.onPicked();
  handlers.onPick("p1");
  handlers.onPicked();
  assert.deepEqual(calls, ["new", "pick p1", "picked"]);
});

test("with onNewProject the picker stays enabled when there is no project", () => {
  const out = renderToStaticMarkup(<ProjectPicker label="Project" projects={[]} value="" onPick={() => {}} onNewProject={() => {}} />);
  assert.doesNotMatch(out, /disabled=""/);
});

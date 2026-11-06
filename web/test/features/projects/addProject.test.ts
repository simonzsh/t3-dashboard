import { test } from "bun:test";
import assert from "node:assert/strict";
import { addLabel, folderTitle, isFolderPath } from "../../../src/features/projects/addProject.ts";

test("isFolderPath: absolute or home paths only, up to 512 characters, no control characters", () => {
  for (const ok of ["/", "/srv/app", "~", "~/src/new", "  ~/x  "]) assert.equal(isFolderPath(ok), true, ok);
  for (const bad of ["", "   ", "src/app", "~user/x", "~x", "/a\nb", "/a\u0000b", `/${"a".repeat(512)}`]) assert.equal(isFolderPath(bad), false, bad);
  assert.equal(isFolderPath(`/${"a".repeat(511)}`), true);
});

test("folderTitle: the last segment, or project for the root", () => {
  assert.equal(folderTitle("~/src/new-thing"), "new-thing");
  assert.equal(folderTitle("/srv/app/"), "app");
  assert.equal(folderTitle("/"), "project");
  assert.equal(folderTitle("~"), "");
  assert.equal(folderTitle("~/"), "");
  assert.equal(folderTitle("~/src/./app/../web"), "web");
});

test("addLabel: Create & Add only for a folder that does not exist", () => {
  assert.equal(addLabel("missing"), "Create & Add");
  assert.equal(addLabel("directory"), "Add");
  assert.equal(addLabel("file"), "Add");
  assert.equal(addLabel(null), "Add");
});

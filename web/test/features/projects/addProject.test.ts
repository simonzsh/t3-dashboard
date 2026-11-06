import { test } from "bun:test";
import assert from "node:assert/strict";
import { addLabel, folderTitle, isFolderPath, siblingsQuery } from "../../../src/features/projects/addProject.ts";

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

test("siblingsQuery lists the parent of a folder typed in full, only then", () => {
  const dir = (path: string, entries: string[] = [path]) => ({ path, kind: "directory" as const, entries: entries.map((p) => ({ name: p.split("/").pop()!, path: p })) });
  assert.equal(siblingsQuery("~/x", dir("/home/me/src/app")), "/home/me/src/");
  assert.equal(siblingsQuery("~/x", dir("/home/me/src/app", [])), "/home/me/src/");
  assert.equal(siblingsQuery("~/x", dir("/home/me/src/app", ["/home/me/src/app", "/home/me/src/app2"])), null);
  assert.equal(siblingsQuery("~/x", { path: "/home/me/src/new", kind: "missing", entries: [] }), null);
  assert.equal(siblingsQuery("~/x", dir("/home")), "/");
  assert.equal(siblingsQuery("~/src/", dir("/home/me/src", [])), null);
});

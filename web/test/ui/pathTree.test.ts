import assert from "node:assert/strict";
import { test } from "bun:test";
import { pathTree, type PathNode } from "../../src/ui/pathTree.ts";

const names = (nodes: PathNode<string>[]): unknown => nodes.map((n) => (n.item ? n.name : { [n.name]: names(n.children) }));

test("pathTree groups paths by folder in first-seen order and merges lone sub-folders", () => {
  const paths = ["web/src/ui/a.ts", "web/src/ui/b.ts", "web/test/ui/a.test.ts", "README.md", "docs/usage.md"];
  const tree = pathTree(paths, (p) => p.split("/"), (p) => p);
  assert.deepEqual(names(tree), [{ web: [{ "src/ui": ["a.ts", "b.ts"] }, { "test/ui": ["a.test.ts"] }] }, "README.md", { docs: ["usage.md"] }]);
  assert.equal(tree[0]!.children[0]!.key, "web/src/ui");
  assert.equal(tree[0]!.children[0]!.children[0]!.item, "web/src/ui/a.ts");
});

test("a lone folder chain collapses into one row", () => {
  assert.deepEqual(names(pathTree(["a/b/c/d.ts"], (p) => p.split("/"), (p) => p)), [{ "a/b/c": ["d.ts"] }]);
  assert.deepEqual(pathTree([], (p: string) => p.split("/"), (p) => p), []);
});

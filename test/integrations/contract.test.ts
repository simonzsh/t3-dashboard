import assert from "node:assert/strict";
import { test } from "bun:test";
import { issues, parse, s, type Infer } from "../../src/integrations/contract.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";

const Thread = s.object({
  id: s.string(),
  title: s.optional(s.nullable(s.string())),
  tags: s.optional(s.array(s.string())),
  extra: s.optional(s.unknown()),
});

test("a matching value passes and extra keys are ignored", () => {
  const value = { id: "t1", title: null, tags: ["a"], other: 3 };
  assert.deepEqual(issues(Thread, value), []);
  const parsed: Infer<typeof Thread> = parse(Thread, value, { system: "t3", what: "thread" });
  assert.equal(parsed, value);
});

test("each issue names the path, the expected type and the actual type", () => {
  assert.deepEqual(issues(Thread, { id: 4, tags: ["a", 2] }), [
    { path: "id", expected: "string", actual: "number" },
    { path: "tags[1]", expected: "string", actual: "number" },
  ]);
  assert.deepEqual(issues(Thread, null), [{ path: "(root)", expected: "object", actual: "null" }]);
  assert.deepEqual(issues(s.array(s.number()), {}), [{ path: "(root)", expected: "array", actual: "object" }]);
});

test("parse throws a protocol IntegrationError with the path but never the value", () => {
  const error = (() => {
    try {
      parse(Thread, { id: "secret-value", title: 12 }, { system: "linear", what: "Linear issues" });
    } catch (caught) {
      return caught;
    }
  })();
  assert.ok(error instanceof IntegrationError);
  assert.equal(error.system, "linear");
  assert.equal(error.kind, "protocol");
  assert.equal(error.message, "Unexpected Linear issues: title should be string or null, got number");
  assert.ok(!error.message.includes("12") && !error.message.includes("secret-value"));
});

test("literal, record and union check their values", () => {
  assert.deepEqual(issues(s.literal("image"), "image"), []);
  assert.deepEqual(issues(s.literal("image"), "file"), [{ path: "(root)", expected: '"image"', actual: "string" }]);
  assert.deepEqual(issues(s.record(s.string()), { a: "x", b: 1 }), [{ path: "b", expected: "string", actual: "number" }]);
  const either = s.union(s.object({ item: s.object({ id: s.string() }) }), s.object({ id: s.optional(s.string()) }));
  assert.deepEqual(issues(either, { item: { id: "1" } }), []);
  assert.deepEqual(issues(either, "x"), [{ path: "(root)", expected: "object or object", actual: "string" }]);
});

test("variant checks the known kinds and lets unknown kinds through", () => {
  const Item = s.variant("kind", { removed: s.object({ id: s.string() }), synchronized: s.object({}) });
  assert.deepEqual(issues(Item, { kind: "removed", id: "1" }), []);
  assert.deepEqual(issues(Item, { kind: "removed", id: 1 }), [{ path: "id", expected: "string", actual: "number" }]);
  assert.deepEqual(issues(Item, { kind: "renamed", anything: 1 }), []);
  assert.deepEqual(issues(Item, { kind: 3 }), [{ path: "kind", expected: "string", actual: "number" }]);
});

test("boolean and number reject other types", () => {
  assert.deepEqual(issues(s.boolean(), "true"), [{ path: "(root)", expected: "boolean", actual: "string" }]);
  assert.deepEqual(issues(s.number(), "1"), [{ path: "(root)", expected: "number", actual: "string" }]);
});

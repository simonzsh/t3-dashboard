import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";
import { SessionsView } from "../../../src/features/sessions/SessionsView.tsx";

test("shell-only renders stop at the Sessions boundary without hiding changed props", () => {
  const boundary = SessionsView as unknown as { $$typeof: symbol; compare: unknown };
  assert.equal(boundary.$$typeof, Symbol.for("react.memo"));
  assert.equal(boundary.compare, null, "use React's shallow comparison so all changed props still update");
});

test("the session list menu callback stays stable across unrelated parent renders", () => {
  const source = readFileSync(new URL("../../../src/features/sessions/SessionsView.tsx", import.meta.url), "utf8");
  assert.match(source, /const menuContext = useCallback\([\s\S]*?\[t3EnvironmentId, alertsConfigured, armedAlerts, onToggleAlert\]/);
  assert.match(source, /menuContext=\{menuContext\}/);
  assert.doesNotMatch(source, /menuContext=\{\s*\(/);
});

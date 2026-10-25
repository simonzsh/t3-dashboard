import assert from "node:assert/strict";
import { test } from "bun:test";
import { envAllowedHosts, envPort } from "../../src/config/config.ts";

test("an empty or invalid PORT means the default port", () => {
  for (const PORT of ["", "abc", "0", "70000", "12.5"]) assert.equal(envPort({ PORT }), 4300, PORT);
  assert.equal(envPort({}), 4300);
  assert.equal(envPort({ PORT: "4999" }), 4999);
});

test("T3_DASHBOARD_ALLOWED_HOSTS is a trimmed, lowercase list without empty items", () => {
  assert.deepEqual(envAllowedHosts({}), []);
  assert.deepEqual(envAllowedHosts({ T3_DASHBOARD_ALLOWED_HOSTS: " Box.ts.net , ,b.example" }), ["box.ts.net", "b.example"]);
});

import { test } from "bun:test";
import assert from "node:assert/strict";
import { alertClickUrl } from "../../../src/features/alerts/alerts.ts";

test("the click URL opens the dashboard on the session, whatever the path it is served from", () => {
  assert.equal(alertClickUrl({ origin: "https://box.example.ts.net", pathname: "/" }, "t1"), "https://box.example.ts.net/#/sessions/t1");
  assert.equal(alertClickUrl({ origin: "http://localhost:3001", pathname: "/dash/" }, "a b"), "http://localhost:3001/dash/#/sessions/a%20b");
});

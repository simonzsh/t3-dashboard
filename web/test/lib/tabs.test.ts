import { test } from "bun:test";
import assert from "node:assert/strict";
import { TABS, hashForPr, hashForTab, prFromHash, tabFromHash } from "../../src/lib/tabs.ts";

test("the tabs are Dashboard, Sessions, Automations, News and Git", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.label]), [["dashboard", "Dashboard"], ["sessions", "Sessions"], ["pulls", "Pull requests"], ["automations", "Automations"], ["news", "News"]]);
});

test("each tab has a one-line description", () => {
  for (const tab of TABS) assert.ok(tab.description.length > 0 && !tab.description.includes("\n"), tab.id);
});

test("each tab has its own hash", () => {
  assert.equal(hashForTab("dashboard"), "#/dashboard");
  assert.equal(hashForTab("sessions"), "#/sessions");
  assert.equal(hashForTab("automations"), "#/automations");
  assert.equal(hashForTab("news"), "#/news");
  assert.equal(hashForTab("pulls"), "#/pulls");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/dashboard"), "dashboard");
  assert.equal(tabFromHash("#/sessions"), "sessions");
  assert.equal(tabFromHash("#/automations"), "automations");
  assert.equal(tabFromHash("#/news"), "news");
  assert.equal(tabFromHash("#/pulls"), "pulls");
});

test("no hash opens Dashboard", () => {
  assert.equal(tabFromHash(""), "dashboard");
  assert.equal(tabFromHash("#"), "dashboard");
  assert.equal(tabFromHash("#/"), "dashboard");
});

test("an unknown hash opens Dashboard", () => {
  for (const hash of ["#/agents", "#/inbox", "#/home", "#/board", "#/settings", "#/Sessions", "#/sessions/extra", "#/constructor", "#/__proto__", "sessions"]) assert.equal(tabFromHash(hash), "dashboard", hash);
});

test("a pull request hash opens the Pull requests page and reads back as its reference", () => {
  const ref = { repository: "acme/storefront", number: 12 };
  assert.equal(hashForPr(ref), "#/pulls/acme/storefront/12");
  assert.deepEqual(prFromHash("#/pulls/acme/storefront/12"), ref);
  assert.equal(tabFromHash("#/pulls/acme/storefront/12"), "pulls");
  assert.deepEqual(prFromHash("#/pulls/my-org/shop.web/7"), { repository: "my-org/shop.web", number: 7 });
});

test("a malformed pull request hash opens the Dashboard", () => {
  for (const hash of ["#/pulls/", "#/pulls/acme", "#/pulls/acme/storefront", "#/pulls/acme/storefront/0", "#/pulls/acme/storefront/x", "#/pulls/acme/storefront/12/diff", "#/pulls/-evil/storefront/1", "#/pulls/acme/../1", "#/Pulls/acme/storefront/1", "#/git/acme/storefront/1", "#/pulls/acme/storefront/012"]) {
    assert.equal(prFromHash(hash), null, hash);
    assert.equal(tabFromHash(hash), "dashboard", hash);
  }
});

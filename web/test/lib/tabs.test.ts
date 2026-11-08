import { test } from "bun:test";
import assert from "node:assert/strict";
import { TABS, hashForPr, hashForTab, prFromHash, tabFromHash } from "../../src/lib/tabs.ts";

test("the tabs are Dashboard, Sessions, Automations, News and Git", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.label]), [["dashboard", "Dashboard"], ["sessions", "Sessions"], ["automations", "Automations"], ["news", "News"], ["git", "Git"]]);
});

test("each tab has a one-line description", () => {
  for (const tab of TABS) assert.ok(tab.description.length > 0 && !tab.description.includes("\n"), tab.id);
});

test("each tab has its own hash", () => {
  assert.equal(hashForTab("dashboard"), "#/dashboard");
  assert.equal(hashForTab("sessions"), "#/sessions");
  assert.equal(hashForTab("automations"), "#/automations");
  assert.equal(hashForTab("news"), "#/news");
  assert.equal(hashForTab("git"), "#/git");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/dashboard"), "dashboard");
  assert.equal(tabFromHash("#/sessions"), "sessions");
  assert.equal(tabFromHash("#/automations"), "automations");
  assert.equal(tabFromHash("#/news"), "news");
  assert.equal(tabFromHash("#/git"), "git");
});

test("no hash opens Dashboard", () => {
  assert.equal(tabFromHash(""), "dashboard");
  assert.equal(tabFromHash("#"), "dashboard");
  assert.equal(tabFromHash("#/"), "dashboard");
});

test("an unknown hash opens Dashboard", () => {
  for (const hash of ["#/agents", "#/inbox", "#/home", "#/board", "#/settings", "#/Sessions", "#/sessions/extra", "#/constructor", "#/__proto__", "sessions"]) assert.equal(tabFromHash(hash), "dashboard", hash);
});

test("a pull request hash opens the Git page and reads back as its reference", () => {
  const ref = { repository: "acme/storefront", number: 12 };
  assert.equal(hashForPr(ref), "#/git/acme/storefront/12");
  assert.deepEqual(prFromHash("#/git/acme/storefront/12"), ref);
  assert.equal(tabFromHash("#/git/acme/storefront/12"), "git");
  assert.deepEqual(prFromHash("#/git/my-org/shop.web/7"), { repository: "my-org/shop.web", number: 7 });
});

test("a malformed pull request hash opens the Dashboard", () => {
  for (const hash of ["#/git/", "#/git/acme", "#/git/acme/storefront", "#/git/acme/storefront/0", "#/git/acme/storefront/x", "#/git/acme/storefront/12/diff", "#/git/-evil/storefront/1", "#/git/acme/../1", "#/Git/acme/storefront/1", "#/git/acme/storefront/012"]) {
    assert.equal(prFromHash(hash), null, hash);
    assert.equal(tabFromHash(hash), "dashboard", hash);
  }
});

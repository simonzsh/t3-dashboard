import { test } from "bun:test";
import assert from "node:assert/strict";
import { TABS, hashForPr, hashForSession, hashForTab, prFromHash, prSourceFromHash, sessionFromHash, tabFromHash } from "../../src/lib/tabs.ts";

test("the tabs are Home, Sessions, Pull requests, Automations and News", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.label]), [["home", "Home"], ["sessions", "Sessions"], ["pulls", "Pull requests"], ["automations", "Automations"], ["news", "News"]]);
});

test("each tab has a one-line description", () => {
  for (const tab of TABS) assert.ok(tab.description.length > 0 && !tab.description.includes("\n"), tab.id);
});

test("each tab has its own hash", () => {
  assert.equal(hashForTab("home"), "#/home");
  assert.equal(hashForTab("sessions"), "#/sessions");
  assert.equal(hashForTab("automations"), "#/automations");
  assert.equal(hashForTab("news"), "#/news");
  assert.equal(hashForTab("pulls"), "#/pulls");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/home"), "home");
  assert.equal(tabFromHash("#/sessions"), "sessions");
  assert.equal(tabFromHash("#/automations"), "automations");
  assert.equal(tabFromHash("#/news"), "news");
  assert.equal(tabFromHash("#/pulls"), "pulls");
});

test("no hash opens Home", () => {
  assert.equal(tabFromHash(""), "home");
  assert.equal(tabFromHash("#"), "home");
  assert.equal(tabFromHash("#/"), "home");
});

test("an unknown hash opens Home", () => {
  for (const hash of ["#/agents", "#/inbox", "#/board", "#/settings", "#/Sessions", "#/sessions/a/b", "#/sessions/", "#/constructor", "#/__proto__", "sessions"]) assert.equal(tabFromHash(hash), "home", hash);
});

test("a pull request hash opens the Pull requests page and reads back as its reference", () => {
  const ref = { repository: "acme/storefront", number: 12 };
  assert.equal(hashForPr(ref), "#/pulls/acme/storefront/12");
  assert.deepEqual(prFromHash("#/pulls/acme/storefront/12"), ref);
  assert.equal(tabFromHash("#/pulls/acme/storefront/12"), "pulls");
  assert.deepEqual(prFromHash("#/pulls/my-org/shop.web/7"), { repository: "my-org/shop.web", number: 7 });
});

test("a malformed pull request hash opens Home", () => {
  for (const hash of ["#/pulls/", "#/pulls/acme", "#/pulls/acme/storefront", "#/pulls/acme/storefront/0", "#/pulls/acme/storefront/x", "#/pulls/acme/storefront/12/diff", "#/pulls/-evil/storefront/1", "#/pulls/acme/../1", "#/Pulls/acme/storefront/1", "#/git/acme/storefront/1", "#/pulls/acme/storefront/012"]) {
    assert.equal(prFromHash(hash), null, hash);
    assert.equal(tabFromHash(hash), "home", hash);
  }
});

test("a session hash opens the Sessions tab and reads back as its thread id", () => {
  assert.equal(hashForSession("thread-1"), "#/sessions/thread-1");
  assert.equal(tabFromHash("#/sessions/thread-1"), "sessions");
  assert.equal(sessionFromHash("#/sessions/thread-1"), "thread-1");
  assert.equal(sessionFromHash(hashForSession("a b/c")), "a b/c");
});

test("only a session hash reads as a session", () => {
  for (const hash of ["", "#/sessions", "#/sessions/", "#/sessions/a/b", "#/pulls/acme/storefront/1", "#/sessions/%E0%A4%A"]) assert.equal(sessionFromHash(hash), null, hash);
});

test("PR addresses preserve the exact source session without changing the PR reference", () => {
  const ref = { repository: "acme/storefront", number: 12 };
  for (const source of ["first", "second", "a b/c?d&e#f"]) {
    const hash = hashForPr(ref, source);
    assert.deepEqual(prFromHash(hash), ref);
    assert.equal(tabFromHash(hash), "pulls");
    assert.equal(prSourceFromHash(hash), source);
  }
  assert.equal(prSourceFromHash(hashForPr(ref)), null);
  assert.equal(prSourceFromHash("#/sessions/a?fromSession=b"), null);
  assert.equal(prSourceFromHash("#/pulls/acme/storefront/0?fromSession=b"), null);
});

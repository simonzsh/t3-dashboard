import assert from "node:assert/strict";
import { test } from "bun:test";
import { ALERT_CLICK_MAX, alertServer, isAlertClick, isAlertTopic } from "../../shared/alerts.ts";

test("a topic is 1 to 64 letters, digits, dashes or underscores", () => {
  assert.equal(isAlertTopic("t3-dashboard_Abc123"), true);
  assert.equal(isAlertTopic("a".repeat(64)), true);
  for (const bad of ["", "a".repeat(65), "has space", "slash/topic", "é"]) assert.equal(isAlertTopic(bad), false, bad);
});

test("a server is a plain http(s) URL, kept without its trailing slash", () => {
  assert.equal(alertServer("https://ntfy.sh/"), "https://ntfy.sh");
  assert.equal(alertServer("http://box.local:8080//"), "http://box.local:8080");
  assert.equal(alertServer("https://example.com/ntfy"), "https://example.com/ntfy");
  for (const bad of ["ntfy.sh", "ftp://ntfy.sh", "https://ntfy.sh/?a=1", "https://ntfy.sh/#x", "https://user:pw@ntfy.sh", `https://${"a".repeat(260)}.com`]) {
    assert.equal(alertServer(bad), null, bad);
  }
});

test("a click URL is an http(s) URL of a bounded length", () => {
  assert.equal(isAlertClick("https://box.tail.ts.net/#/sessions/abc"), true);
  assert.equal(isAlertClick("javascript:alert(1)"), false);
  assert.equal(isAlertClick("not a url"), false);
  assert.equal(isAlertClick(`https://a.example/#${"x".repeat(ALERT_CLICK_MAX)}`), false);
});

import assert from "node:assert/strict";
import { test } from "bun:test";
import type { FormBase } from "../../../src/features/new-thread/automationForm.ts";
import { addFilter, emptyForm, promptPlaceholder, removeFilter, toCreateBody, toggleWeekday, updateFilter, type AutomationForm } from "../../../src/features/new-thread/automationForm.ts";

const now = new Date(2026, 10, 4, 10, 0, 0);
const base: FormBase = { prompt: "  Do it ", projectId: "p1", modelSelection: { instanceId: "i", model: "m" }, runtimeMode: "full-access" };
const build = (change: Partial<AutomationForm>, extra: Partial<FormBase> = {}) => toCreateBody({ ...emptyForm(), ...change }, { ...base, ...extra }, now);

test("a new form is a weekday routine at 9:00 with a GitHub signature", () => {
  const form = emptyForm();
  assert.deepEqual([form.kind, form.routineMode, form.timeOfDay, form.weekdays], ["routine", "fixed", "09:00", [1, 2, 3, 4, 5]]);
  assert.deepEqual([form.signed, form.header, form.encoding, form.prefix], [true, "x-hub-signature-256", "hex", "sha256="]);
});

test("a fixed-time routine keeps its weekdays; an interval routine sends whole minutes", () => {
  assert.deepEqual(build({ title: " Inbox " }), { body: { kind: "routine", title: "Inbox", prompt: "Do it", projectId: "p1", modelSelection: base.modelSelection, runtimeMode: "full-access", schedule: { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2, 3, 4, 5] } } });
  const interval = build({ routineMode: "interval", minutes: "15" });
  assert.deepEqual("body" in interval && interval.body.kind === "routine" && interval.body.schedule, { type: "interval", everyMinutes: 15 });
});

test("a routine with a bad interval, no time, no prompt or no model gives an error", () => {
  for (const minutes of ["", "0", "1.5", "525601", "abc"]) assert.ok("error" in build({ routineMode: "interval", minutes }), minutes);
  assert.ok("error" in build({ timeOfDay: "" }));
  assert.ok("error" in build({}, { prompt: "  " }));
  assert.ok("error" in build({}, { modelSelection: null }));
});

test("a reminder is sent as an ISO time and must be 1 minute to 366 days ahead", () => {
  const at = build({ kind: "reminder", reminderAt: "2026-11-04T17:30" });
  assert.deepEqual("body" in at && at.body.kind === "reminder" && at.body.at, new Date(2026, 10, 4, 17, 30).toISOString());
  for (const reminderAt of ["", "nope", "2026-11-04T10:00", "2026-11-03T10:00", "2027-11-06T10:00"]) assert.ok("error" in build({ kind: "reminder", reminderAt }), reminderAt);
});

test("filter rows add, update, remove and toggle weekdays", () => {
  let form = addFilter(addFilter(emptyForm()));
  assert.deepEqual(form.filters.map((row) => row.id), [1, 2]);
  form = updateFilter(form, 1, { path: "body.action", value: "opened" });
  form = removeFilter(form, 2);
  assert.deepEqual(form.filters, [{ id: 1, path: "body.action", op: "equals", value: "opened" }]);
  assert.deepEqual(addFilter(form).filters.map((row) => row.id), [1, 2]);
  assert.deepEqual(toggleWeekday(emptyForm(), 6).weekdays, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(toggleWeekday(emptyForm(), 1).weekdays, [2, 3, 4, 5]);
});

test("a webhook builds its filters: trimmed values, a split list, exists without value, blank rows skipped", () => {
  let form: AutomationForm = { ...emptyForm(), kind: "webhook", secret: "dummy-secret" };
  for (let i = 0; i < 5; i++) form = addFilter(form);
  form = updateFilter(form, 1, { path: " headers.x-github-event ", value: " pull_request " });
  form = updateFilter(form, 2, { path: "body.action", op: "in", value: "opened, closed ,," });
  form = updateFilter(form, 3, { path: "body.pull_request", op: "exists", value: "ignored" });
  form = updateFilter(form, 4, { path: "body.x", op: "startsWith", value: "a" });
  const result = toCreateBody(form, base, now);
  assert.ok("body" in result && result.body.kind === "webhook");
  assert.deepEqual("body" in result && result.body.kind === "webhook" && result.body.filters, [
    { path: "headers.x-github-event", op: "equals", value: "pull_request" },
    { path: "body.action", op: "in", value: ["opened", "closed"] },
    { path: "body.pull_request", op: "exists" },
    { path: "body.x", op: "startsWith", value: "a" },
  ]);
});

test("a webhook filter with a bad path, no value or an empty list gives an error", () => {
  const hook = (path: string, op: AutomationForm["filters"][number]["op"], value: string) => ({ ...updateFilter(addFilter({ ...emptyForm(), kind: "webhook" as const, secret: "x" }), 1, { path, op, value }) });
  for (const form of [hook("env.x", "equals", "a"), hook("body.a", "equals", ""), hook("body.a", "in", " , "), hook("", "equals", "a")]) {
    assert.ok("error" in toCreateBody(form, base, now), JSON.stringify(form.filters));
  }
});

test("a signed webhook sends the secret as typed; an unsigned one sends null", () => {
  const signed = build({ kind: "webhook", secret: " dummy secret " });
  assert.deepEqual("body" in signed && signed.body.kind === "webhook" && signed.body.signature, { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=", secret: " dummy secret " });
  const open = build({ kind: "webhook", signed: false, secret: "ignored" });
  assert.deepEqual("body" in open && open.body.kind === "webhook" && [open.body.signature, JSON.stringify(open).includes("ignored")], [null, false]);
});

test("a signed webhook without a secret or a header gives an error that never holds the secret", () => {
  assert.ok("error" in build({ kind: "webhook", secret: "  " }));
  assert.ok("error" in build({ kind: "webhook", header: " ", secret: "dummy-secret" }));
  assert.equal(JSON.stringify(build({ kind: "webhook", header: " ", secret: "dummy-secret" })).includes("dummy-secret"), false);
});

test("the prompt placeholder of a webhook shows the template syntax", () => {
  assert.match(promptPlaceholder("webhook"), /\{\{body\.pull_request\.html_url\}\}/);
  assert.notEqual(promptPlaceholder("routine"), promptPlaceholder("reminder"));
});

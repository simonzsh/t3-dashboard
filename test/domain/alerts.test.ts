import assert from "node:assert/strict";
import { test } from "bun:test";
import { ALERTS_ARMED_MAX, NTFY_DEFAULT_SERVER, type AlertsState } from "../../shared/alerts.ts";
import type { DashboardThread } from "../../shared/api.ts";
import type { StoredAlerts } from "../../src/config/alertsFile.ts";
import { createAlerts } from "../../src/domain/alerts.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { NtfyMessage, NtfyTarget, TopicCheck } from "../../src/integrations/ntfy/client.ts";
import { finished, running, thread, waiting } from "../helpers/threads.ts";

const CLICK = (id: string) => `https://dash.example/#/sessions/${id}`;
const SET_UP: StoredAlerts = { server: "https://ntfy.example", topic: "my-topic", armed: [] };
const NOT_SET_UP: StoredAlerts = { server: NTFY_DEFAULT_SERVER, topic: null, armed: [] };

function setup({ initial = SET_UP, threads: initialThreads = [running("a"), running("b")], fail = false, checked = "ok" }: { initial?: StoredAlerts; threads?: DashboardThread[]; fail?: boolean; checked?: TopicCheck } = {}) {
  let threads = initialThreads;
  const saved: StoredAlerts[] = [];
  const changes: AlertsState[] = [];
  const sent: Array<{ target: NtfyTarget; message: NtfyMessage }> = [];
  const warnings: string[] = [];
  const checks: NtfyTarget[] = [];
  let topics = 0;
  const alerts = createAlerts({
    initial,
    persist: (file) => void saved.push(structuredClone(file)),
    send: async (target, message) => {
      sent.push({ target, message });
      if (fail) throw new IntegrationError("ntfy is unreachable", { system: "ntfy", kind: "unreachable" });
    },
    check: async (target) => (checks.push(target), checked),
    newTopic: () => `new-topic-${++topics}`,
    threads: () => threads,
    projectTitle: (id) => (id === "project-a" ? "Dashboard" : undefined),
    now: () => new Date("2026-02-03T04:05:06.000Z"),
    onChange: (state) => void changes.push(state),
    warn: (message) => void warnings.push(message),
  });
  const observe = async (next: DashboardThread[]) => {
    threads = next;
    alerts.observe(next);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { alerts, saved, changes, sent, warnings, checks, observe };
}
const rejected = async (work: unknown, code: string) => assert.rejects(Promise.resolve().then(() => work), (error) => error instanceof DomainError && error.code === code);

test("settings: not set up shows nothing, set up shows the topic and the subscribe link", () => {
  assert.deepEqual(setup({ initial: NOT_SET_UP }).alerts.settings(), { connected: false, server: null, topic: null, subscribeUrl: null });
  assert.deepEqual(setup().alerts.settings(), { connected: true, server: "https://ntfy.example", topic: "my-topic", subscribeUrl: "https://ntfy.example/my-topic" });
});

test("state never holds the topic", () => {
  const { alerts } = setup({ initial: { ...SET_UP, armed: [{ threadId: "a", clickUrl: CLICK("a"), armedAt: "x" }] } });
  assert.deepEqual(alerts.state(), { configured: true, armed: ["a"] });
  assert.equal(JSON.stringify(alerts.state()).includes("my-topic"), false);
});

test("setup makes a topic on the default server, saves it and broadcasts", () => {
  const { alerts, saved, changes } = setup({ initial: NOT_SET_UP });
  assert.deepEqual(alerts.setup(), { connected: true, server: NTFY_DEFAULT_SERVER, topic: "new-topic-1", subscribeUrl: `${NTFY_DEFAULT_SERVER}/new-topic-1` });
  assert.deepEqual(saved, [{ server: NTFY_DEFAULT_SERVER, topic: "new-topic-1", armed: [] }]);
  assert.deepEqual(changes, [{ configured: true, armed: [] }]);
});

test("setup takes a self-hosted server without its trailing slash, and refuses a bad one", () => {
  const { alerts, saved } = setup({ initial: NOT_SET_UP });
  assert.equal(alerts.setup("http://box.local:8080/").server, "http://box.local:8080");
  assert.equal(saved.length, 1);
  assert.throws(() => alerts.setup("ntfy.sh"), (error) => error instanceof DomainError && error.code === "invalid");
  assert.equal(saved.length, 1);
});

test("useTopic keeps an existing topic, and refuses a bad topic or server", () => {
  const { alerts, saved } = setup({ initial: NOT_SET_UP });
  assert.equal(alerts.useTopic("friends-topic", "https://ntfy.example").subscribeUrl, "https://ntfy.example/friends-topic");
  assert.equal(saved.at(-1)!.topic, "friends-topic");
  assert.equal(alerts.useTopic("other").server, NTFY_DEFAULT_SERVER);
  assert.throws(() => alerts.useTopic("bad topic"), (error) => error instanceof DomainError && error.code === "invalid");
  assert.throws(() => alerts.useTopic("ok", "nope"), (error) => error instanceof DomainError && error.code === "invalid");
});

test("test sends through check; it needs a set up topic", async () => {
  const { alerts, checks } = setup({ checked: "refused" });
  assert.deepEqual(await alerts.test(), { result: "refused" });
  assert.deepEqual(checks, [{ server: "https://ntfy.example", topic: "my-topic" }]);
  await rejected(setup({ initial: NOT_SET_UP }).alerts.test(), "conflict");
});

test("disconnect clears the topic and every armed thread, and broadcasts", () => {
  const { alerts, saved, changes } = setup();
  alerts.arm("a", CLICK("a"));
  assert.deepEqual(alerts.disconnect(), { connected: false, server: null, topic: null, subscribeUrl: null });
  assert.deepEqual(alerts.state(), { configured: false, armed: [] });
  assert.deepEqual(saved.at(-1), NOT_SET_UP);
  assert.deepEqual(changes.at(-1), { configured: false, armed: [] });
});

test("arm needs a set up topic, a known thread and a free slot", () => {
  assert.throws(() => setup({ initial: NOT_SET_UP }).alerts.arm("a", CLICK("a")), (error) => error instanceof DomainError && error.code === "conflict");
  assert.throws(() => setup().alerts.arm("nope", CLICK("nope")), (error) => error instanceof DomainError && error.code === "not-found");
  const many = Array.from({ length: ALERTS_ARMED_MAX + 1 }, (_, i) => running(`t${i}`));
  const { alerts } = setup({ threads: many });
  for (let i = 0; i < ALERTS_ARMED_MAX; i++) alerts.arm(`t${i}`, CLICK(`t${i}`));
  assert.throws(() => alerts.arm(`t${ALERTS_ARMED_MAX}`, CLICK("x")), (error) => error instanceof DomainError && error.code === "conflict");
  // A thread already armed can still be armed again.
  assert.doesNotThrow(() => alerts.arm("t0", CLICK("t0")));
});

test("arm saves and broadcasts; re-arm replaces the click URL; disarm is idempotent", () => {
  const { alerts, saved, changes } = setup();
  assert.deepEqual(alerts.arm("a", CLICK("a")), { configured: true, armed: ["a"] });
  assert.deepEqual(saved.at(-1)!.armed, [{ threadId: "a", clickUrl: CLICK("a"), armedAt: "2026-02-03T04:05:06.000Z" }]);
  alerts.arm("a", "https://other.example/#/sessions/a");
  assert.equal(saved.at(-1)!.armed.length, 1);
  assert.equal(saved.at(-1)!.armed[0]!.clickUrl, "https://other.example/#/sessions/a");
  assert.deepEqual(alerts.disarm("a"), { configured: true, armed: [] });
  const before = saved.length;
  assert.deepEqual(alerts.disarm("a"), { configured: true, armed: [] });
  assert.equal(saved.length, before);
  assert.equal(changes.length, 3);
});

test("a working thread that finishes sends one alert and disarms; the next change sends none", async () => {
  const { alerts, sent, changes, observe } = setup();
  await observe([running("a"), running("b")]);
  alerts.arm("a", CLICK("a"));
  await observe([finished("a"), running("b")]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.target, { server: "https://ntfy.example", topic: "my-topic" });
  assert.deepEqual(sent[0]!.message, { title: "Thread a", message: "Finished · Dashboard", priority: 3, click: CLICK("a") });
  assert.deepEqual(changes.at(-1), { configured: true, armed: [] });
  await observe([running("a"), running("b")]);
  await observe([finished("a"), running("b")]);
  assert.equal(sent.length, 1);
});

test("a thread that starts waiting sends a high priority alert; a failed finish too", async () => {
  const { alerts, sent, observe } = setup();
  await observe([running("a"), running("b")]);
  alerts.arm("a", CLICK("a"));
  alerts.arm("b", CLICK("b"));
  await observe([waiting("a"), finished("b", { status: "failed" })]);
  assert.deepEqual(sent.map((s) => [s.message.message, s.message.priority]), [["Needs approval · Dashboard", 4], ["Failed · Dashboard", 4]]);
});

test("the title falls back to Session; an unknown project adds nothing", async () => {
  const { alerts, sent, observe } = setup({ threads: [running("a", { title: "", projectId: "gone" })] });
  await observe([running("a", { title: "", projectId: "gone" })]);
  alerts.arm("a", CLICK("a"));
  await observe([finished("a", { title: "", projectId: "gone" })]);
  assert.deepEqual([sent[0]!.message.title, sent[0]!.message.message], ["Session", "Finished"]);
});

test("a thread that is not armed sends nothing", async () => {
  const { sent, observe } = setup();
  await observe([running("a")]);
  await observe([finished("a")]);
  assert.deepEqual(sent, []);
});

test("after a restart, an armed thread that already finished sends nothing and stays armed", async () => {
  const initial = { ...SET_UP, armed: [{ threadId: "a", clickUrl: CLICK("a"), armedAt: "x" }] };
  const { alerts, sent, observe } = setup({ initial, threads: [finished("a")] });
  await observe([finished("a")]);
  assert.deepEqual(sent, []);
  assert.deepEqual(alerts.state().armed, ["a"]);
  await observe([running("a")]);
  await observe([finished("a")]);
  assert.equal(sent.length, 1);
});

test("a failed send still disarms, and the warning holds no topic", async () => {
  const { alerts, sent, warnings, saved, observe } = setup({ fail: true });
  await observe([running("a")]);
  alerts.arm("a", CLICK("a"));
  await observe([finished("a")]);
  assert.equal(sent.length, 1);
  assert.deepEqual(alerts.state().armed, []);
  assert.deepEqual(saved.at(-1)!.armed, []);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]!.includes("my-topic"), false);
  await observe([running("a")]);
  await observe([finished("a")]);
  assert.equal(sent.length, 1);
});

test("the alert is saved as disarmed before the send starts", async () => {
  const order: string[] = [];
  const alerts = createAlerts({
    initial: SET_UP,
    persist: (file) => void order.push(`persist:${file.armed.length}`),
    send: async () => void order.push("send"),
    check: async () => "ok",
    newTopic: () => "t",
    threads: () => [running("a")],
    projectTitle: () => undefined,
    now: () => new Date(),
    onChange: () => void order.push("change"),
    warn: () => {},
  });
  alerts.observe([running("a")]);
  alerts.arm("a", CLICK("a"));
  order.length = 0;
  alerts.observe([finished("a")]);
  assert.deepEqual(order, ["persist:0", "change", "send"]);
});

test("an armed thread that no longer exists is disarmed without an alert", async () => {
  const { alerts, sent, changes, observe } = setup();
  await observe([running("a"), running("b")]);
  alerts.arm("a", CLICK("a"));
  await observe([running("b")]);
  assert.deepEqual(sent, []);
  assert.deepEqual(alerts.state().armed, []);
  assert.deepEqual(changes.at(-1), { configured: true, armed: [] });
});

test("a thread that was already waiting when armed fires only on a new change", async () => {
  const { alerts, sent, observe } = setup({ threads: [waiting("a")] });
  await observe([waiting("a")]);
  alerts.arm("a", CLICK("a"));
  await observe([waiting("a")]);
  assert.deepEqual(sent, []);
  await observe([thread("a", { status: "running", activeRunId: "r" })]);
  await observe([waiting("a")]);
  assert.equal(sent.length, 1);
});

test("a failed write still sends the alert and keeps the thread disarmed", async () => {
  let failWrites = false;
  const sent: string[] = [];
  const warnings: string[] = [];
  const alerts = createAlerts({
    initial: SET_UP,
    persist: () => {
      if (failWrites) throw new Error("disk full");
    },
    send: async (_target, message) => void sent.push(message.title),
    check: async () => "ok",
    newTopic: () => "t",
    threads: () => [running("a")],
    projectTitle: () => undefined,
    now: () => new Date(),
    onChange: () => {},
    warn: (message) => void warnings.push(message),
  });
  alerts.observe([running("a")]);
  alerts.arm("a", CLICK("a"));
  failWrites = true;
  assert.doesNotThrow(() => alerts.observe([finished("a")]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, 1);
  assert.deepEqual(alerts.state().armed, []);
  assert.equal(warnings.length, 1);
  alerts.observe([running("a")]);
  alerts.observe([finished("a")]);
  assert.equal(sent.length, 1);
});

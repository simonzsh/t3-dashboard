import assert from "node:assert/strict";
import { test } from "bun:test";
import type { ConnectionStatus, DashboardProvider, SetupInfo } from "../shared/api.ts";
import { INSTALL_URL, ISSUE_COMMAND } from "../src/auth.ts";
import { LiveSync, toProviders } from "../src/live.ts";
import { ShellStore } from "../src/shellStore.ts";
import { T3HttpError } from "../src/t3/client.ts";
import type { RawConfig, ShellItem, T3Port } from "../src/t3/types.ts";
import { tick } from "./helpers/fakeSocket.ts";

const now = () => new Date("2026-03-20T12:00:00.000Z");

class FakePort implements T3Port {
  config: () => Promise<RawConfig> = async () => ({ providers: [], environment: { serverVersion: "1.0.0", orchestrationProtocolVersion: 2 } });
  subscriptions: Array<{ onItems(items: ShellItem[]): void; onEnd(error?: Error): void; cancelled: boolean }> = [];
  async threadProjection() {
    return {};
  }
  async dispatch() {}
  getConfig() {
    return this.config();
  }
  async persistAttachments() {
    return [];
  }
  subscribeShell(onItems: (items: ShellItem[]) => void, onEnd: (error?: Error) => void) {
    const subscription = { onItems, onEnd, cancelled: false };
    this.subscriptions.push(subscription);
    return {
      cancel() {
        subscription.cancelled = true;
      },
    };
  }
}

// A status can repeat while the config arrives: compare the sequence of distinct states.
const sequence = (statuses: ConnectionStatus[]) => statuses.map((status) => status.t3).filter((t3, i, all) => t3 !== all[i - 1]);

async function until(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) await tick();
  assert.ok(condition(), "condition not reached");
}

const tokenSetup = { reason: "token-needed", detail: null, issueCommand: ISSUE_COMMAND, installUrl: INSTALL_URL } as const;

class FakeAuth {
  token: string | null = "token-1";
  info: SetupInfo | null = null;
  refreshes = 0;
  onRefresh: () => void = () => {};
  current() {
    return this.token;
  }
  setup() {
    return this.info;
  }
  async refresh() {
    this.refreshes++;
    this.onRefresh();
  }
}

function setup(port = new FakePort(), auth = new FakeAuth()) {
  const statuses: ConnectionStatus[] = [];
  const providers: DashboardProvider[][] = [];
  const sleeps: number[] = [];
  const store = new ShellStore({ now, onState() {}, onThreads() {}, onProjects() {} });
  const live = new LiveSync({
    port,
    store,
    origin: () => "http://127.0.0.1:3773",
    auth,
    onConnection: (status) => statuses.push(status),
    onProviders: (list) => providers.push(list),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now,
  });
  return { port, store, live, statuses, providers, sleeps, auth };
}

const commit = (port: FakePort, index = port.subscriptions.length - 1) =>
  port.subscriptions[index]!.onItems([{ kind: "snapshot", snapshot: { threads: [{ id: "thread-1" }], projects: [] } }, { kind: "synchronized" }]);

test("status goes connecting, live, then offline with the error", async () => {
  const { port, live, statuses } = setup();
  live.start();
  await until(() => port.subscriptions.length === 1);
  assert.deepEqual(sequence(statuses), ["connecting"]);
  commit(port);
  assert.deepEqual(sequence(statuses), ["connecting", "live"]);
  port.subscriptions[0]!.onEnd(new Error("socket lost"));
  await until(() => sequence(statuses).length === 4);
  assert.deepEqual(sequence(statuses), ["connecting", "live", "offline", "connecting"]);
  assert.equal(statuses.find((status) => status.t3 === "offline")!.error, "socket lost");
  live.stop();
});

test("the status carries origin, server version and no mismatch", async () => {
  const { port, live, statuses } = setup();
  live.start();
  await until(() => port.subscriptions.length === 1);
  commit(port);
  const status = statuses.at(-1)!;
  assert.equal(status.origin, "http://127.0.0.1:3773");
  assert.equal(status.serverVersion, "1.0.0");
  assert.equal(status.protocolMismatch, false);
  assert.equal(status.error, null);
  live.stop();
});

test("protocolMismatch is set when the protocol version is not 2", async () => {
  const port = new FakePort();
  port.config = async () => ({ environment: { orchestrationProtocolVersion: 3 } });
  const { live, statuses } = setup(port);
  live.start();
  await until(() => port.subscriptions.length === 1);
  commit(port);
  assert.equal(statuses.at(-1)!.protocolMismatch, true);
  live.stop();
});

test("providers are filtered to enabled and ready, with fallbacks", async () => {
  const port = new FakePort();
  port.config = async () => ({
    providers: [
      { instanceId: "provider-a", displayName: "Provider A", enabled: true, status: "ready", models: [{ slug: "model-x", name: "Model X" }, { slug: "model-y" }] },
      { instanceId: "provider-b", enabled: true, status: "ready", models: [] },
      { instanceId: "provider-c", enabled: false, status: "ready" },
      { instanceId: "provider-d", enabled: true, status: "disabled" },
    ],
  });
  const { live, providers } = setup(port);
  live.start();
  await until(() => providers.length === 1);
  assert.deepEqual(providers[0], [
    { instanceId: "provider-a", displayName: "Provider A", models: [{ slug: "model-x", name: "Model X", effort: null }, { slug: "model-y", name: "model-y", effort: null }], runtimeModes: ["approval-required", "auto-accept-edits", "auto", "full-access"] },
    { instanceId: "provider-b", displayName: "provider-b", models: [], runtimeModes: ["approval-required", "auto-accept-edits", "auto", "full-access"] },
  ]);
  live.stop();
});

test("toProviders keeps the effort levels a model accepts and the provider's runtime modes", () => {
  const effort = {
    id: "effort",
    label: "Reasoning",
    type: "select",
    options: [{ id: "low", label: "Low" }, { id: "high", label: "High", isDefault: true }, { id: "ultrathink", label: "Ultrathink" }],
    promptInjectedValues: ["ultrathink"],
  };
  const tier = { id: "serviceTier", label: "Tier", type: "select", options: [{ id: "default", label: "Standard" }] };
  const reasoning = { id: "reasoningEffort", label: "Reasoning", type: "select", options: [{ id: "medium", label: "Medium" }], currentValue: "medium" };
  const [a, b] = toProviders({
    providers: [
      { instanceId: "a", enabled: true, status: "ready", models: [{ slug: "m1", capabilities: { optionDescriptors: [{ id: "fastMode", label: "Fast", type: "boolean" }, effort] } }] },
      { instanceId: "b", enabled: true, status: "ready", supportedRuntimeModes: ["approval-required", "bogus", "full-access"], models: [{ slug: "m2", capabilities: { optionDescriptors: [tier, reasoning] } }] },
    ],
  });
  assert.deepEqual(a!.models[0]!.effort, { optionId: "effort", levels: [{ id: "low", label: "Low" }, { id: "high", label: "High" }], defaultLevel: "high" });
  assert.deepEqual(b!.models[0]!.effort, { optionId: "reasoningEffort", levels: [{ id: "medium", label: "Medium" }], defaultLevel: "medium" });
  assert.deepEqual(b!.runtimeModes, ["approval-required", "full-access"]);
});

test("a getConfig failure does not block the stream and is recorded", async () => {
  const port = new FakePort();
  port.config = async () => {
    throw new Error("config down");
  };
  const { live, statuses, providers } = setup(port);
  live.start();
  await until(() => port.subscriptions.length === 1);
  commit(port);
  assert.equal(statuses.at(-1)!.t3, "live");
  assert.equal(statuses.at(-1)!.error, "config down");
  assert.equal(providers.length, 0);
  live.stop();
});

test("backoff doubles up to 30 s and resets after a commit", async () => {
  const { port, live, sleeps } = setup();
  live.start();
  for (let i = 1; i <= 7; i++) {
    await until(() => port.subscriptions.length === i);
    port.subscriptions[i - 1]!.onEnd(new Error("down"));
  }
  await until(() => sleeps.length === 7);
  assert.deepEqual(sleeps, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  await until(() => port.subscriptions.length === 8);
  commit(port);
  port.subscriptions[7]!.onEnd(new Error("down"));
  await until(() => sleeps.length === 8);
  assert.equal(sleeps[7], 1000);
  live.stop();
});

test("beginSync runs again on every reconnect, and the last state stays visible", async () => {
  const { port, live, store } = setup();
  live.start();
  await until(() => port.subscriptions.length === 1);
  commit(port);
  assert.equal(store.isSyncing(), false);
  port.subscriptions[0]!.onEnd();
  await until(() => port.subscriptions.length === 2);
  assert.equal(store.isSyncing(), true);
  assert.deepEqual(store.thread("thread-1")?.id, "thread-1");
  live.stop();
});

test("stop cancels the subscription and prevents reconnects", async () => {
  const { port, live, sleeps } = setup();
  live.start();
  await until(() => port.subscriptions.length === 1);
  live.stop();
  assert.equal(port.subscriptions[0]!.cancelled, true);
  port.subscriptions[0]!.onEnd(new Error("late"));
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(port.subscriptions.length, 1);
  assert.deepEqual(sleeps, []);
});

test("without a token it shows needs-token and waits instead of spinning", async () => {
  const auth = new FakeAuth();
  auth.token = null;
  auth.info = tokenSetup;
  const { port, live, statuses, sleeps } = setup(new FakePort(), auth);
  live.start();
  await until(() => statuses.length === 1);
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0]!.t3, "needs-token");
  assert.deepEqual(statuses[0]!.setup, tokenSetup);
  assert.equal(port.subscriptions.length, 0);
  assert.equal(sleeps.length, 0);
  live.stop();
});

test("retryNow connects once a token exists, and the setup goes away when live", async () => {
  const auth = new FakeAuth();
  auth.token = null;
  auth.info = tokenSetup;
  const { port, live, statuses } = setup(new FakePort(), auth);
  live.start();
  await until(() => statuses.length === 1);
  auth.token = "pasted";
  auth.info = null;
  live.retryNow();
  assert.equal(live.connection().t3, "connecting");
  assert.equal(live.connection().setup, null);
  await until(() => port.subscriptions.length === 1);
  commit(port);
  assert.equal(live.connection().t3, "live");
  assert.equal(live.connection().setup, null);
  live.stop();
});

test("retryNow without a token reports the current setup at once", async () => {
  const auth = new FakeAuth();
  auth.token = null;
  auth.info = tokenSetup;
  const { live, statuses } = setup(new FakePort(), auth);
  live.start();
  await until(() => statuses.length === 1);
  auth.info = { ...tokenSetup, reason: "t3-stopped" };
  live.retryNow();
  assert.equal(live.connection().setup?.reason, "t3-stopped");
  live.stop();
});

test("a 401 refreshes the token exactly once per cycle", async () => {
  const port = new FakePort();
  let first = true;
  port.config = async () => {
    if (!first) return {};
    first = false;
    throw new T3HttpError(401, "T3 answered 401");
  };
  const { live, auth } = setup(port);
  live.start();
  await until(() => port.subscriptions.length === 1);
  port.subscriptions[0]!.onEnd(new T3HttpError(401, "T3 answered 401"));
  await until(() => port.subscriptions.length === 2);
  assert.equal(auth.refreshes, 1);
  live.stop();
});

test("a refresh that finds no token ends in needs-token", async () => {
  const port = new FakePort();
  const { live, auth, statuses } = setup(port);
  auth.onRefresh = () => {
    auth.token = null;
    auth.info = tokenSetup;
  };
  live.start();
  await until(() => port.subscriptions.length === 1);
  port.subscriptions[0]!.onEnd(new T3HttpError(403, "T3 answered 403"));
  await until(() => statuses.at(-1)?.t3 === "needs-token");
  assert.deepEqual(statuses.at(-1)!.setup, tokenSetup);
  live.stop();
});

test("a failure that is not an auth error never refreshes the token", async () => {
  const { port, live, auth } = setup();
  live.start();
  await until(() => port.subscriptions.length === 1);
  port.subscriptions[0]!.onEnd(new T3HttpError(500, "T3 answered 500"));
  await until(() => port.subscriptions.length === 2);
  assert.equal(auth.refreshes, 0);
  live.stop();
});

test("T3 not answering shows the stopped setup from the second failure, and live clears it", async () => {
  const { port, live, statuses } = setup();
  live.start();
  await until(() => port.subscriptions.length === 1);
  port.subscriptions[0]!.onEnd(new TypeError("Unable to connect"));
  await until(() => port.subscriptions.length === 2);
  assert.equal(statuses.filter((status) => status.setup !== null).length, 0);
  port.subscriptions[1]!.onEnd(new TypeError("Unable to connect"));
  await until(() => port.subscriptions.length === 3);
  const stopped = statuses.find((status) => status.setup !== null)!;
  assert.deepEqual([stopped.t3, stopped.setup?.reason], ["offline", "t3-stopped"]);
  commit(port);
  assert.equal(live.connection().setup, null);
  live.stop();
});

test("retryNow cuts the backoff short", async () => {
  const port = new FakePort();
  const auth = new FakeAuth();
  const slow = new LiveSync({
    port,
    store: new ShellStore({ now, onState() {}, onThreads() {}, onProjects() {} }),
    origin: () => "http://127.0.0.1:3773",
    auth,
    onConnection() {},
    onProviders() {},
    sleep: () => new Promise(() => {}),
    now,
  });
  slow.start();
  await until(() => port.subscriptions.length === 1);
  port.subscriptions[0]!.onEnd(new Error("down"));
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(port.subscriptions.length, 1);
  slow.retryNow();
  await until(() => port.subscriptions.length === 2);
  slow.stop();
});

test("a stopped T3 is looked for again on the backoff timer, without Retry", async () => {
  const auth = new FakeAuth();
  auth.token = null;
  auth.info = { ...tokenSetup, reason: "t3-stopped" };
  auth.onRefresh = () => {
    if (auth.refreshes === 2) auth.token = "token-2";
  };
  const { port, live, sleeps } = setup(new FakePort(), auth);
  live.start();
  await until(() => port.subscriptions.length === 1);
  assert.equal(auth.refreshes, 2);
  assert.deepEqual(sleeps.slice(0, 2), [1000, 2000]);
  live.stop();
});

test("a missing token that is not a stopped T3 waits for Retry", async () => {
  const auth = new FakeAuth();
  auth.token = null;
  auth.info = tokenSetup;
  const { live, sleeps } = setup(new FakePort(), auth);
  live.start();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(auth.refreshes, 0);
  assert.deepEqual(sleeps, []);
  live.stop();
});

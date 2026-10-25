import assert from "node:assert/strict";
import { test } from "bun:test";
import type { ConnectionStatus, DashboardProvider } from "../shared/api.ts";
import { LiveSync } from "../src/live.ts";
import { ShellStore } from "../src/shellStore.ts";
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

function setup(port = new FakePort()) {
  const statuses: ConnectionStatus[] = [];
  const providers: DashboardProvider[][] = [];
  const sleeps: number[] = [];
  const store = new ShellStore({ now, onState() {}, onThreads() {}, onProjects() {} });
  const live = new LiveSync({
    port,
    store,
    origin: () => "http://127.0.0.1:3773",
    onConnection: (status) => statuses.push(status),
    onProviders: (list) => providers.push(list),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now,
  });
  return { port, store, live, statuses, providers, sleeps };
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
    { instanceId: "provider-a", displayName: "Provider A", models: [{ slug: "model-x", name: "Model X" }, { slug: "model-y", name: "model-y" }] },
    { instanceId: "provider-b", displayName: "provider-b", models: [] },
  ]);
  live.stop();
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

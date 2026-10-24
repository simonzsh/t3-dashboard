import { setTimeout as delay } from "node:timers/promises";
import type { ConnectionStatus, DashboardProvider } from "../shared/api.ts";
import type { ShellStore } from "./shellStore.ts";
import type { RawConfig, T3Port } from "./t3/types.ts";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const EXPECTED_PROTOCOL = 2;

export interface LiveSyncOptions {
  port: T3Port;
  store: ShellStore;
  origin: () => string;
  onConnection(status: ConnectionStatus): void;
  onProviders(providers: DashboardProvider[]): void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const toProviders = (config: RawConfig): DashboardProvider[] =>
  (config.providers ?? [])
    .filter((provider) => provider.enabled && provider.status === "ready")
    .map((provider) => ({
      instanceId: provider.instanceId,
      displayName: provider.displayName ?? provider.instanceId,
      models: (provider.models ?? []).map((model) => ({ slug: model.slug, name: model.name ?? model.slug })),
    }));

/** Keeps the store in sync with T3: subscribe, follow, and reconnect with backoff. */
export class LiveSync {
  private readonly options: LiveSyncOptions;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private status: ConnectionStatus;
  private stopped = false;
  private current: { cancel(): void } | undefined;
  private wake: (() => void) | undefined;

  constructor(options: LiveSyncOptions) {
    this.options = options;
    this.sleep = options.sleep ?? ((ms) => delay(ms, undefined, { ref: false }));
    this.now = options.now ?? (() => new Date());
    this.status = { t3: "connecting", origin: null, serverVersion: null, protocolMismatch: false, error: null, since: this.now().toISOString() };
  }

  connection(): ConnectionStatus {
    return this.status;
  }

  start(): void {
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.current?.cancel();
    this.wake?.();
  }

  private setStatus(change: Partial<ConnectionStatus>): void {
    const next = { ...this.status, ...change };
    if (next.t3 !== this.status.t3) next.since = this.now().toISOString();
    this.status = next;
    this.options.onConnection(next);
  }

  private async run(): Promise<void> {
    let attempt = 0;
    while (!this.stopped) {
      this.setStatus({ t3: "connecting", origin: this.options.origin(), error: null });
      await this.loadConfig();
      if (this.stopped) return;
      const error = await this.follow(() => (attempt = 0));
      if (this.stopped) return;
      this.setStatus({ t3: "offline", error: error?.message ?? "T3 subscription ended" });
      await this.sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!);
      attempt++;
    }
  }

  // A config failure leaves providers unchanged: the shell stream does not depend on it.
  private async loadConfig(): Promise<void> {
    try {
      const config = await this.options.port.getConfig();
      this.options.onProviders(toProviders(config));
      const protocol = config.environment?.orchestrationProtocolVersion;
      this.setStatus({
        serverVersion: config.environment?.serverVersion ?? null,
        protocolMismatch: protocol != null && protocol !== EXPECTED_PROTOCOL,
      });
    } catch (error) {
      this.setStatus({ error: (error as Error).message });
    }
  }

  private follow(onCommit: () => void): Promise<Error | undefined> {
    const { port, store } = this.options;
    store.beginSync();
    return new Promise((resolve) => {
      let live = false;
      this.current = port.subscribeShell(
        (items) => {
          store.apply(items);
          if (live || store.isSyncing()) return;
          live = true;
          onCommit();
          this.setStatus({ t3: "live" });
        },
        (error) => resolve(error),
      );
      this.wake = () => resolve(undefined);
    });
  }
}

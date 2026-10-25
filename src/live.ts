import { setTimeout as delay } from "node:timers/promises";
import type { ConnectionStatus, DashboardProvider, ModelEffort, SetupInfo } from "../shared/api.ts";
import type { TokenManager } from "./auth.ts";
import { INSTALL_URL, ISSUE_COMMAND } from "./integrations/t3/cli.ts";
import type { ShellStore } from "./shellStore.ts";
import { MissingTokenError, T3HttpError } from "./integrations/t3/client.ts";
import { RUNTIME_MODES } from "./integrations/t3/commands.ts";
import type { RawConfig, RawOptionDescriptor, T3Port } from "./integrations/t3/schemas.ts";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const EXPECTED_PROTOCOL = 2;

export interface LiveSyncOptions {
  port: T3Port;
  store: ShellStore;
  auth: Pick<TokenManager, "current" | "setup" | "refresh">;
  onConnection(status: ConnectionStatus): void;
  onProviders(providers: DashboardProvider[]): void;
  sleep?: (ms: number) => Promise<void>;
}

const FALLBACK_SETUP = { issueCommand: ISSUE_COMMAND, installUrl: INSTALL_URL };

// Anything that is not an HTTP answer or a missing token: T3 did not answer at all.
const isNetworkError = (error: Error | undefined): boolean => !(error instanceof T3HttpError) && !(error instanceof MissingTokenError);

const EFFORT_OPTION_IDS = new Set(["effort", "reasoningEffort"]);

// Prompt-injected values (such as "ultrathink") are words T3 adds to the prompt, not levels.
function toEffort(descriptors: RawOptionDescriptor[] = []): ModelEffort | null {
  const raw = descriptors.find((descriptor) => descriptor.type === "select" && EFFORT_OPTION_IDS.has(descriptor.id));
  if (!raw) return null;
  const injected = new Set(raw.promptInjectedValues ?? []);
  const levels = (raw.options ?? []).filter((option) => !injected.has(option.id)).map((option) => ({ id: option.id, label: option.label ?? option.id }));
  const fallback = typeof raw.currentValue === "string" ? raw.currentValue : null;
  const defaultLevel = (raw.options ?? []).find((option) => option.isDefault && !injected.has(option.id))?.id ?? fallback;
  return levels.length ? { optionId: raw.id, levels, defaultLevel } : null;
}

export const toProviders = (config: RawConfig): DashboardProvider[] =>
  (config.providers ?? [])
    .filter((provider) => provider.enabled && provider.status === "ready")
    .map((provider) => ({
      instanceId: provider.instanceId,
      displayName: provider.displayName ?? provider.instanceId,
      models: (provider.models ?? []).map((model) => ({ slug: model.slug, name: model.name ?? model.slug, effort: toEffort(model.capabilities?.optionDescriptors) })),
      runtimeModes: provider.supportedRuntimeModes ? RUNTIME_MODES.filter((mode) => provider.supportedRuntimeModes!.includes(mode)) : RUNTIME_MODES,
    }));

/** Keeps the store in sync with T3: subscribe, follow, and reconnect with backoff. */
export class LiveSync {
  private readonly options: LiveSyncOptions;
  private readonly sleep: (ms: number) => Promise<void>;
  private status: ConnectionStatus;
  private stopped = false;
  private current: { cancel(): void } | undefined;
  private wake: (() => void) | undefined;
  private refreshed = false;

  constructor(options: LiveSyncOptions) {
    this.options = options;
    this.sleep = options.sleep ?? ((ms) => delay(ms, undefined, { ref: false }));
    this.status = { t3: "connecting", serverVersion: null, protocolMismatch: false, error: null, setup: null };
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

  /** Skips the wait and tries again now. Call it after the token or T3 changed. */
  retryNow(): void {
    if (this.options.auth.current() === null) this.setStatus({ t3: "needs-token", setup: this.options.auth.setup() });
    else this.setStatus({ t3: "connecting", setup: null });
    this.wake?.();
  }

  private setStatus(change: Partial<ConnectionStatus>): void {
    const next = { ...this.status, ...change };
    this.status = next;
    this.options.onConnection(next);
  }

  private async run(): Promise<void> {
    let attempt = 0;
    let idle = 0;
    while (!this.stopped) {
      this.refreshed = false;
      if (this.options.auth.current() === null) {
        const setup = this.options.auth.setup();
        this.setStatus({ t3: "needs-token", error: null, setup });
        if (setup?.reason !== "t3-stopped") {
          idle = 0;
          await this.pause(null);
          continue;
        }
        // T3 was not running: look for a token again by itself once it starts.
        await this.pause(BACKOFF_MS[Math.min(idle++, BACKOFF_MS.length - 1)]!);
        if (!this.stopped) await this.options.auth.refresh();
        continue;
      }
      idle = 0;
      // The setup screen stays up while a retry connects, so it does not flash.
      this.setStatus({ t3: "connecting", error: null, setup: this.status.t3 === "needs-token" ? null : this.status.setup });
      await this.loadConfig();
      if (this.stopped) return;
      const error = await this.follow(() => (attempt = 0));
      if (this.stopped) return;
      await this.recover(error);
      // The first failure only shows the banner: a short drop should not hide the dashboard.
      this.setStatus({ t3: "offline", error: error?.message ?? "T3 subscription ended", setup: attempt >= 1 && isNetworkError(error) ? this.stoppedSetup() : this.status.setup });
      await this.pause(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!);
      attempt++;
    }
  }

  private stoppedSetup(): SetupInfo {
    const { issueCommand, installUrl } = this.options.auth.setup() ?? FALLBACK_SETUP;
    return { reason: "t3-stopped", detail: null, issueCommand, installUrl };
  }

  // T3 refuses a token it no longer knows: ask the manager for a new one, once per cycle.
  private async recover(error: Error | undefined): Promise<void> {
    if (!(error instanceof T3HttpError) || (error.status !== 401 && error.status !== 403) || this.refreshed) return;
    this.refreshed = true;
    await this.options.auth.refresh();
  }

  // Waits out the backoff, or forever (null) until retryNow or stop wakes it.
  private async pause(ms: number | null): Promise<void> {
    const woken = new Promise<void>((resolve) => (this.wake = resolve));
    await (ms === null ? woken : Promise.race([this.sleep(ms), woken]));
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
      await this.recover(error as Error);
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
          this.setStatus({ t3: "live", setup: null });
        },
        (error) => resolve(error),
      );
      this.wake = () => resolve(undefined);
    });
  }
}

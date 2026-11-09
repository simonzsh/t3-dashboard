import type { UpdateChannel, UpdateStatus } from "../../shared/api.ts";
import { isNewer, updateChannel } from "../config/version.ts";
import { DomainError } from "./errors.ts";

export interface UpdateManagerOptions {
  version: string;
  channel?: UpdateChannel;
  saveChannel?(channel: UpdateChannel): void;
  /** Latest release for the selected channel. Throws while its build is missing or GitHub fails. */
  latestTag(channel: UpdateChannel): Promise<string>;
  /** Why this dashboard cannot update itself, or null when it can. */
  unavailable: string | null;
  /** Installs the latest release. Returns false when nothing was installed. */
  run(channel: UpdateChannel): Promise<boolean>;
}

export class UpdateManager {
  private latest: string | null = null;
  private updating = false;
  private error: string | null = null;
  private channel: UpdateChannel;
  private checkId = 0;

  private readonly options: UpdateManagerOptions;

  constructor(options: UpdateManagerOptions) {
    this.options = options;
    this.channel = options.channel ?? updateChannel({}, options.version);
  }

  status(): UpdateStatus {
    const { version, unavailable } = this.options;
    return {
      channel: this.channel,
      current: version,
      latest: this.latest,
      available: this.latest !== null && isNewer(this.latest, version),
      canUpdate: unavailable === null,
      reason: unavailable,
      updating: this.updating,
      error: this.error,
    };
  }

  /** Asks GitHub. A failure keeps the last answer: it is never shown. */
  async check(): Promise<UpdateStatus> {
    const id = ++this.checkId;
    const channel = this.channel;
    try {
      const latest = (await this.options.latestTag(channel)).replace(/^v/, "");
      if (id !== this.checkId) return this.status();
      this.latest = latest;
      // A fresh answer replaces the last failure, which would otherwise stay on screen.
      this.error = null;
    } catch {
      // No release yet or no network: stay quiet.
    }
    return this.status();
  }

  async setChannel(channel: UpdateChannel): Promise<UpdateStatus> {
    if (this.updating) throw new DomainError("conflict", "Wait for the update to finish before changing its channel.");
    this.options.saveChannel?.(channel);
    if (channel !== this.channel) {
      this.channel = channel;
      this.checkId++;
      this.latest = null;
      this.error = null;
    }
    return this.check();
  }

  /** Starts the update in the background. Returns the reason why it did not start. */
  apply(): { started: true } | { started: false; reason: string } {
    if (this.options.unavailable !== null) return { started: false, reason: this.options.unavailable };
    if (this.updating) return { started: false, reason: "An update is already running." };
    this.updating = true;
    this.error = null;
    this.options
      .run(this.channel)
      .then((installed) => {
        if (!installed) this.error = "No newer release found.";
      })
      .catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        this.updating = false;
      });
    return { started: true };
  }
}

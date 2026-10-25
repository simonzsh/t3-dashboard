import type { UpdateStatus } from "../../shared/api.ts";
import { isNewer } from "../config/version.ts";

export interface UpdateManagerOptions {
  version: string;
  /** Latest release tag, e.g. `v1.2.3`. Throws when there is none or GitHub fails. */
  latestTag(): Promise<string>;
  /** Why this dashboard cannot update itself, or null when it can. */
  unavailable: string | null;
  /** Installs the latest release. Returns false when nothing was installed. */
  run(): Promise<boolean>;
}

export class UpdateManager {
  private latest: string | null = null;
  private updating = false;
  private error: string | null = null;

  private readonly options: UpdateManagerOptions;

  constructor(options: UpdateManagerOptions) {
    this.options = options;
  }

  status(): UpdateStatus {
    const { version, unavailable } = this.options;
    return {
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
    try {
      this.latest = (await this.options.latestTag()).replace(/^v/, "");
      // A fresh answer replaces the last failure, which would otherwise stay on screen.
      this.error = null;
    } catch {
      // No release yet or no network: stay quiet.
    }
    return this.status();
  }

  /** Starts the update in the background. Returns the reason why it did not start. */
  apply(): { started: true } | { started: false; reason: string } {
    if (this.options.unavailable !== null) return { started: false, reason: this.options.unavailable };
    if (this.updating) return { started: false, reason: "An update is already running." };
    this.updating = true;
    this.error = null;
    this.options
      .run()
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

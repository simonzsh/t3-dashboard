import type { UsageOverview } from "../../../../shared/api.ts";
import { errorMessage } from "../../lib/format.ts";
import { pollDelay } from "./usageView.ts";

export interface UsagePatch {
  usage?: UsageOverview;
  error?: string | null;
  loading: boolean;
}

export interface UsagePollDeps {
  read: (force: boolean) => Promise<UsageOverview>;
  schedule: (run: () => void, ms: number) => () => void;
  emit: (patch: UsagePatch) => void;
}

// Reads, then again after pollDelay. An error keeps the last good value (no `usage` in the patch).
export function startUsagePoll({ read, schedule, emit }: UsagePollDeps, force: boolean): () => void {
  let stopped = false;
  let cancel: (() => void) | undefined;
  const run = async (forced: boolean) => {
    emit({ loading: true });
    let wait = pollDelay(false);
    let patch: UsagePatch;
    try {
      const usage = await read(forced);
      wait = pollDelay(usage.cost.refreshing);
      patch = { usage, error: null, loading: false };
    } catch (e) {
      patch = { error: errorMessage(e), loading: false };
    }
    if (stopped) return;
    emit(patch);
    cancel = schedule(() => void run(false), wait);
  };
  void run(force);
  return () => {
    stopped = true;
    cancel?.();
  };
}

import { later } from "../../../../shared/seen.ts";
import type { DashboardThread } from "../../../../shared/threads.ts";

// Detection is shared with the server, which sends the phone alerts.
export { statusMap, transitions, type NotifyEntry, type NotifyKind } from "../../../../shared/notify.ts";

// The T3 clock, not the browser's, so a device with a skewed clock hides nothing and shows nothing extra.
export const baselineOf = (threads: DashboardThread[]): string => threads.map((t) => t.lastActivityAt).reduce(later, "") || new Date().toISOString();

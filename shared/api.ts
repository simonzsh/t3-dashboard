// Contract between the dashboard server (src/) and the web UI (web/), split by topic.
// This barrel re-exports the types; values (limits, statuses) come from their own files.
export type * from "./threads.ts";
export type * from "./connection.ts";
export type * from "./events.ts";
export type * from "./requests.ts";
export type * from "./linear.ts";
export type * from "./settings.ts";
export type * from "./automations.ts";
export type * from "./search.ts";

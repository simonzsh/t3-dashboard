// Contract between the dashboard server (src/) and the web UI (web/), split by topic.
// This barrel re-exports the types; values (limits, statuses) come from their own files.
export type * from "./threads.ts";
export type * from "./connection.ts";
export type * from "./events.ts";
export type * from "./requests.ts";
export type * from "./linear.ts";
export type * from "./vcs.ts";
export type * from "./settings.ts";
export type * from "./automations.ts";
export type * from "./news.ts";
export type * from "./search.ts";
export type * from "./sessions.ts";
export type * from "./stash.ts";
export type * from "./seen.ts";
export type * from "./usage.ts";
export type * from "./providerLimits.ts";
export type * from "./serverStats.ts";
export type * from "./cacheCleanup.ts";
export type * from "./git.ts";

import { s, type Infer } from "../contract.ts";

// An assistant config also holds a token: only these two fields are ever read, each on its own.
export const BrainWorkspace = s.object({ workspace: s.string() });
export const BrainProject = s.object({ projectId: s.string() });

// jobs/<id>.yaml, as t3-agent writes it.
export const Job = s.object({
  prompt: s.optional(s.string()),
  schedule: s.optional(s.object({ cron: s.optional(s.string()), timeZone: s.optional(s.string()), at: s.optional(s.string()) })),
  target: s.optional(s.object({ newThread: s.optional(s.string()), thread: s.optional(s.string()) })),
  engine: s.optional(s.object({ model: s.optional(s.string()) })),
});
export type Job = Infer<typeof Job>;

// state/routine-threads.json and state/runs.json, keyed by job id.
export const RoutineThread = s.object({ threadId: s.optional(s.string()), engine: s.optional(s.object({ model: s.optional(s.string()) })) });
export type RoutineThread = Infer<typeof RoutineThread>;
export const RunAt = s.string();

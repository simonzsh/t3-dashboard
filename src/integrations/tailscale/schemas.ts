import { s, type Infer } from "../contract.ts";

export const TailscaleStatus = s.object({
  BackendState: s.string(),
  Self: s.optional(s.nullable(s.object({ DNSName: s.optional(s.string()) }))),
});

const Handler = s.object({ Proxy: s.optional(s.string()) });

/** `{}` is valid: nothing is served. */
export const ServeStatus = s.object({
  TCP: s.optional(s.nullable(s.record(s.object({ HTTPS: s.optional(s.boolean()) })))),
  Web: s.optional(s.nullable(s.record(s.object({ Handlers: s.optional(s.nullable(s.record(Handler))) })))),
});
export type ServeStatus = Infer<typeof ServeStatus>;

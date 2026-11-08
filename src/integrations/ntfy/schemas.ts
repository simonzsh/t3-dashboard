import { s, type Infer } from "../contract.ts";

// ntfy answers the published message; only its presence matters.
export const PublishAnswer = s.object({ id: s.string(), event: s.string() });
export type PublishAnswer = Infer<typeof PublishAnswer>;

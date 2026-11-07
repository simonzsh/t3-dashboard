import type { T3Port } from "../integrations/t3/schemas.ts";

/**
 * T3 writes the task id on the first user message of a run thread.
 * Returns the task id, null when the thread has none, or undefined when it cannot be read yet.
 */
export async function readScheduledTaskId(port: Pick<T3Port, "threadProjection">, threadId: string): Promise<string | null | undefined> {
  try {
    const users = ((await port.threadProjection(threadId)).messages ?? []).filter((message) => message.role === "user");
    if (users.length === 0) return undefined;
    return users.find((message) => message.scheduledTaskId)?.scheduledTaskId ?? null;
  } catch {
    return undefined;
  }
}

import type { SecretAnswerBody, SecretStatus } from "../../../../shared/api.ts";
import { MAX_SECRET_CHARS } from "../../../../shared/limits.ts";

export const SECRET_STATUS_LABELS: Record<Exclude<SecretStatus, "pending">, string> = {
  saved: "Saved",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** The body for Save, or null while the field is blank or too long. Trimmed, as T3 stores it trimmed. */
export function saveBody(value: string): SecretAnswerBody | null {
  const secret = value.trim();
  return secret === "" || secret.length > MAX_SECRET_CHARS ? null : { secret };
}

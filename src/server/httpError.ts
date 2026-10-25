import { DomainError, type DomainErrorCode } from "../domain/errors.ts";
import { IntegrationError } from "../integrations/errors.ts";

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DOMAIN_STATUS: Record<DomainErrorCode, number> = { invalid: 400, "not-found": 404, conflict: 409 };

/** The one mapping from a thrown error to an HTTP answer; null means an unexpected error. */
export function toHttp(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (error instanceof DomainError) return new HttpError(DOMAIN_STATUS[error.code], error.message);
  // A refused Linear key is the user's input; every other failure is the other system's.
  if (error instanceof IntegrationError) return new HttpError(error.system === "linear" && error.kind === "refused" ? 400 : 502, error.message);
  return null;
}

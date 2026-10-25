export type DomainErrorCode = "invalid" | "not-found" | "conflict";

// A rule says no. The message is shown to the user; the server picks the HTTP status.
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

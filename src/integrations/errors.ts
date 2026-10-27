export type IntegrationSystem = "t3" | "linear" | "github";

/** unreachable: no answer; refused: an answer that says no; protocol: an answer we cannot read. */
export type IntegrationErrorKind = "unreachable" | "refused" | "protocol" | "not-authenticated";

// The message is shown to the user: it never holds a response body, a token or a key.
export class IntegrationError extends Error {
  readonly system: IntegrationSystem;
  readonly kind: IntegrationErrorKind;
  readonly status: number | undefined;

  constructor(message: string, { system, kind, status }: { system: IntegrationSystem; kind: IntegrationErrorKind; status?: number }) {
    super(message);
    this.system = system;
    this.kind = kind;
    this.status = status;
  }
}

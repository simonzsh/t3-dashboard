import { randomBytes } from "node:crypto";
import { parse } from "../contract.ts";
import { IntegrationError, type IntegrationErrorKind } from "../errors.ts";
import { PublishAnswer } from "./schemas.ts";

const FETCH_TIMEOUT_MS = 15_000;
const REFUSED_STATUSES = new Set([401, 403, 429]);

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type TopicCheck = "ok" | "refused" | "unreachable";
export interface NtfyTarget {
  server: string;
  topic: string;
}
export interface NtfyMessage {
  title: string;
  message: string;
  priority: number;
  click?: string;
}

const fail = (kind: IntegrationErrorKind, message: string, status?: number) => new IntegrationError(message, { system: "ntfy", kind, status });

/** A random topic: its name is the only secret, so it is long and unguessable. */
export const newTopic = (): string => `t3-dashboard-${randomBytes(12).toString("base64url")}`;

export class NtfyClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike) {
    this.fetchImpl = fetchImpl;
  }

  // Error texts never hold the topic, the body or the click URL: the topic is the secret.
  async publish({ server, topic }: NtfyTarget, message: NtfyMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(server, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, ...message }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw fail("unreachable", "ntfy is unreachable");
    }
    if (REFUSED_STATUSES.has(response.status)) throw fail("refused", `ntfy refused this topic (HTTP ${response.status})`, response.status);
    if (!response.ok) throw fail("unreachable", `ntfy answered HTTP ${response.status}`, response.status);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw fail("protocol", "Unexpected ntfy answer: not JSON");
    }
    parse(PublishAnswer, body, { system: "ntfy", what: "ntfy answer" });
  }

  async check(target: NtfyTarget): Promise<TopicCheck> {
    try {
      await this.publish(target, { title: "Test alert", message: "Alerts from your dashboard work.", priority: 3 });
      return "ok";
    } catch (error) {
      return error instanceof IntegrationError && error.kind === "refused" ? "refused" : "unreachable";
    }
  }
}

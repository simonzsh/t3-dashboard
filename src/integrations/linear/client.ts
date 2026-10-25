import { parse } from "../contract.ts";
import { IntegrationError, type IntegrationErrorKind } from "../errors.ts";
import { AssignedIssuesPage, Viewer, type LinearIssueNode } from "./schemas.ts";

const ENDPOINT = "https://api.linear.app/graphql";
export const VIEWER_QUERY = "{ viewer { id } }";
export const QUERY = `query($after: String) { viewer { assignedIssues(first: 100, after: $after, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title url priority priorityLabel updatedAt state { name type color } project { id name } team { key name } } pageInfo { hasNextPage endCursor } } } }`;
// 20 pages of 100: a hard stop for a runaway cursor.
const MAX_PAGES = 20;
// A stalled Linear would otherwise hold the board request for minutes.
const FETCH_TIMEOUT_MS = 15_000;
// One budget for every page of a load, so 20 slow pages cannot add up.
const LOAD_TIMEOUT_MS = 30_000;
// Linear answers 400, 401 or 403 to a key it does not know.
const REFUSED_STATUSES = new Set([400, 401, 403]);

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type KeyCheck = "ok" | "refused" | "unreachable";

const fail = (kind: IntegrationErrorKind, message: string, status?: number) => new IntegrationError(message, { system: "linear", kind, status });

/** The Linear GraphQL API, with a personal key per call. */
export class LinearClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike) {
    this.fetchImpl = fetchImpl;
  }

  async verifyKey(apiKey: string): Promise<KeyCheck> {
    try {
      parse(Viewer, await this.query(apiKey, VIEWER_QUERY), { system: "linear", what: "Linear viewer" });
      return "ok";
    } catch (error) {
      return error instanceof IntegrationError && error.kind === "refused" ? "refused" : "unreachable";
    }
  }

  /** Every open issue assigned to the key's owner, page after page. */
  async assignedIssues(apiKey: string): Promise<LinearIssueNode[]> {
    const issues: LinearIssueNode[] = [];
    let after: string | undefined;
    const signal = AbortSignal.timeout(LOAD_TIMEOUT_MS);
    for (let page = 0; page < MAX_PAGES; page++) {
      const { pageInfo, nodes } = parse(AssignedIssuesPage, await this.query(apiKey, QUERY, { after }, signal), { system: "linear", what: "Linear issues" }).viewer.assignedIssues;
      issues.push(...nodes);
      if (!pageInfo.hasNextPage) return issues;
      if (pageInfo.endCursor === null) {
        throw fail("protocol", "Unexpected Linear issues: viewer.assignedIssues.pageInfo.endCursor should be string, got null");
      }
      after = pageInfo.endCursor;
    }
    throw fail("unreachable", `Too many assigned issues to load (over ${MAX_PAGES * 100})`);
  }

  // Error texts never include the response body or the key: both can echo it back.
  async query(apiKey: string, text: string, variables?: Record<string, unknown>, signal: AbortSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS)): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: apiKey },
        body: JSON.stringify({ query: text, variables }),
        signal,
      });
    } catch {
      throw fail("unreachable", "Linear is unreachable");
    }
    if (REFUSED_STATUSES.has(response.status)) throw fail("refused", `Linear refused this key (HTTP ${response.status})`, response.status);
    if (!response.ok) throw fail("unreachable", `Linear answered HTTP ${response.status}`, response.status);
    let body: { data?: unknown; errors?: unknown };
    try {
      body = await response.json();
    } catch {
      throw fail("protocol", "Unreadable Linear response");
    }
    if (body.errors || !body.data) throw fail("refused", "Linear returned an error");
    return body.data;
  }
}

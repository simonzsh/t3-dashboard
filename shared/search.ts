// Message search across conversations: GET /api/search.
export interface ThreadSearchMatch {
  threadId: string;
  projectId: string;
  source: "user" | "assistant";
  /** At most 240 characters around the hit. */
  snippet: string;
  messageCreatedAt: string | null;
}

export interface ThreadSearchResult {
  matches: ThreadSearchMatch[];
}

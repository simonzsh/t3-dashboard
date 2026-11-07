import { s, type Infer } from "../contract.ts";

// Only the fields the board reads: each one is sent to the browser as is.
export const LinearIssueNode = s.object({
  id: s.string(),
  identifier: s.string(),
  title: s.string(),
  url: s.string(),
  priority: s.number(),
  priorityLabel: s.string(),
  updatedAt: s.string(),
  dueDate: s.nullable(s.string()),
  state: s.object({ name: s.string(), type: s.string(), color: s.string() }),
  project: s.nullable(s.object({ id: s.string(), name: s.string() })),
  team: s.object({ key: s.string(), name: s.string() }),
});
export type LinearIssueNode = Infer<typeof LinearIssueNode>;

export const AssignedIssuesPage = s.object({
  viewer: s.object({
    assignedIssues: s.object({
      nodes: s.array(LinearIssueNode),
      pageInfo: s.object({ hasNextPage: s.boolean(), endCursor: s.nullable(s.string()) }),
    }),
  }),
});

export const Viewer = s.object({ viewer: s.object({ id: s.string() }) });

export const LinearInboxNode = s.object({
  id: s.string(),
  type: s.string(),
  createdAt: s.string(),
  readAt: s.nullable(s.string()),
  archivedAt: s.nullable(s.string()),
  snoozedUntilAt: s.nullable(s.string()),
  actor: s.nullable(s.object({ name: s.string() })),
  botActor: s.nullable(s.object({ name: s.nullable(s.string()) })),
  comment: s.nullable(s.object({ url: s.string() })),
  // Required: the type filter returns only issue notifications, and a missing issue is drift.
  issue: s.object({ id: s.string(), identifier: s.string(), title: s.string(), url: s.string(), priority: s.number(), state: s.object({ type: s.string() }) }),
});
export type LinearInboxNode = Infer<typeof LinearInboxNode>;

export const InboxPage = s.object({ notifications: s.object({ nodes: s.array(LinearInboxNode) }) });

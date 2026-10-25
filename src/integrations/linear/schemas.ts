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

/** One assigned issue as Linear sends it. */
export const linearNode = (n: number) => ({
  id: `issue-${n}`,
  identifier: `TEAM-${n}`,
  title: `Issue ${n}`,
  url: `https://linear.example/TEAM-${n}`,
  priority: 2,
  priorityLabel: "High",
  updatedAt: "2026-03-20T10:00:00.000Z",
  state: { name: "Todo", type: "unstarted", color: "#ccc" },
  project: null,
  team: { key: "TEAM", name: "Team 1" },
});

/** A Linear answer that serves both the viewer check and a page of assigned issues. */
export const linearPage = (nodes: unknown[], pageInfo: { hasNextPage: boolean; endCursor: string | null } = { hasNextPage: false, endCursor: null }) =>
  new Response(JSON.stringify({ data: { viewer: { id: "u1", assignedIssues: { nodes, pageInfo } } } }), { status: 200 });

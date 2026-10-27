import type { LinearIssueNode } from "../../integrations/linear/schemas.ts";
import type { RawConfig, RawProject, RawProjection, RawScheduledTask, RawSubagent, RawThread, RawTurnItem } from "../../integrations/t3/schemas.ts";

// Invented data for `bun run demo`: a small team building "Atlas", no real names.
// Times are minutes before `now`, so the page always reads "2 min ago", "yesterday"...

export const SCRATCH_PROJECT_ID = "demo-no-project";
export const DEMO_ENVIRONMENT_ID = "demo-environment";

const PROJECTS: RawProject[] = [
  { id: "demo-atlas-web", title: "Atlas Web", projectIcon: { kind: "lucide", name: "folder-code", color: "blue" } },
  { id: "demo-atlas-api", title: "Atlas API", projectIcon: { kind: "lucide", name: "folder-tree", color: "green" } },
  { id: "demo-mobile", title: "Mobile App", projectIcon: { kind: "lucide", name: "smartphone", color: "purple" } },
  { id: "demo-docs", title: "Docs site", projectIcon: { kind: "lucide", name: "book-open", color: "gray" } },
  { id: "demo-assistant", title: "Assistant", projectIcon: { kind: "lucide", name: "brain", color: "purple" } },
  { id: SCRATCH_PROJECT_ID, title: "No project" },
];

const CLAUDE = { instanceId: "claudeAgent", model: "claude-opus-5-5" };
const SONNET = { instanceId: "claudeAgent", model: "claude-sonnet-5" };
const CODEX = { instanceId: "codex", model: "gpt-5.5-codex" };

type Role = "user" | "assistant";
const LAST = "@last-message";

interface ThreadSpec {
  id: string;
  projectId: string;
  title: string;
  model: { instanceId: string; model: string };
  status: string;
  messages: Array<[Role, number, string]>;
  runs?: Array<{ id: string; status: string; started: number; completed?: number }>;
  activity?: Array<Omit<RawTurnItem, "startedAt" | "completedAt"> & { at: number; done?: number }>;
  subagents?: Array<Omit<RawSubagent, "startedAt" | "completedAt"> & { at: number; done?: number }>;
  request?: { id: string; kind: string; at: number; item: RawTurnItem };
  thread?: Partial<RawThread>;
}

const SPECS: ThreadSpec[] = [
  {
    id: "demo-checkout",
    projectId: "demo-atlas-web",
    title: "Redesign the checkout summary",
    model: CLAUDE,
    status: "running",
    messages: [
      ["user", 52, "The checkout summary is hard to scan on mobile. Make totals stand out and group the fees."],
      [
        "assistant",
        44,
        "I looked at `OrderSummary.tsx` and the design spec. Plan:\n\n1. Group shipping, taxes and fees under one **Fees** row that expands.\n2. Show the total in a larger font, aligned right.\n3. Keep the promo code field, but collapse it by default.\n\nI'll start with the layout, then update the tests.",
      ],
      ["user", 7, "Looks good. Go ahead, and check the 375 px layout too."],
      ["assistant", 2, "Layout done. Two subagents are checking price formatting and mobile breakpoints while I update the snapshot tests."],
    ],
    runs: [
      { id: "run-checkout-1", status: "completed", started: 50, completed: 44 },
      { id: "run-checkout-2", status: "running", started: 6 },
    ],
    activity: [
      { id: "a1", type: "reasoning", runId: "run-checkout-2", text: "Read the summary component and its tests before changing the layout.", at: 6, done: 6 },
      { id: "a2", type: "command_execution", runId: "run-checkout-2", input: 'rg -n "OrderSummary" web/src', exitCode: 0, at: 6, done: 6 },
      { id: "a3", type: "file_change", runId: "run-checkout-2", fileName: "web/src/checkout/OrderSummary.tsx", at: 5, done: 5 },
      { id: "a4", type: "subagent", runId: "run-checkout-2", title: "Audit price formatting helpers", at: 5, done: 3 },
      { id: "a5", type: "subagent", runId: "run-checkout-2", title: "Check mobile breakpoints", status: "running", at: 4 },
      { id: "a6", type: "file_change", runId: "run-checkout-2", fileName: "web/src/checkout/summary.css", at: 3, done: 3 },
      { id: "a7", type: "command_execution", runId: "run-checkout-2", input: "bun test web/src/checkout", exitCode: 0, at: 2, done: 2 },
      { id: "a8", type: "dynamic_tool", runId: "run-checkout-2", toolName: "mcp__browser__preview_open", input: { url: "http://localhost:5173/checkout" }, at: 2, done: 1 },
      { id: "a9", type: "reasoning", runId: "run-checkout-2", text: "Compare the new layout with the design spec.", status: "running", at: 1 },
    ],
    subagents: [
      { id: "sub-format", runId: "run-checkout-2", title: "Audit price formatting helpers", status: "completed", result: "Two helpers format prices: `formatPrice` and `toCurrency`. Only `formatPrice` handles locales; the summary now uses it everywhere.", at: 5, done: 3 },
      { id: "sub-mobile", runId: "run-checkout-2", title: "Check mobile breakpoints", status: "running", progress: "Testing 375 px and 768 px widths", at: 4 },
    ],
    thread: { activeRunId: "run-checkout-2", runtimeMode: "full-access", pinnedAt: LAST },
  },
  {
    id: "demo-rate-limit",
    projectId: "demo-atlas-api",
    title: "Add rate limiting to public endpoints",
    model: CODEX,
    status: "running",
    messages: [
      ["user", 12, "Add a rate limit to `/v1/public/*`: 60 requests per minute per API key, with a `Retry-After` header."],
      [
        "assistant",
        1,
        "I'm adding a token bucket middleware:\n\n```ts\nexport const rateLimit = bucket({ capacity: 60, refillPerSecond: 1 });\napp.use(\"/v1/public/*\", rateLimit.byHeader(\"x-api-key\"));\n```\n\nNext: tests for the 429 answer and the `Retry-After` value.",
      ],
    ],
    runs: [{ id: "run-rate-1", status: "running", started: 11 }],
    activity: [
      { id: "b1", type: "reasoning", runId: "run-rate-1", text: "Look for an existing middleware folder and the test setup.", at: 11, done: 11 },
      { id: "b2", type: "command_execution", runId: "run-rate-1", input: "ls src/middleware", exitCode: 0, at: 10, done: 10 },
      { id: "b3", type: "file_change", runId: "run-rate-1", fileName: "src/middleware/rateLimit.ts", at: 6, done: 6 },
      { id: "b4", type: "command_execution", runId: "run-rate-1", input: "bun test src/middleware", status: "running", at: 1 },
    ],
    thread: { activeRunId: "run-rate-1", runtimeMode: "auto-accept-edits" },
  },
  {
    id: "demo-migration",
    projectId: "demo-atlas-api",
    title: "Migrate the invoices table",
    model: CLAUDE,
    status: "waiting",
    messages: [
      ["user", 18, "Split `invoices.address` into street, city and postcode. Keep the old column until the release after."],
      ["assistant", 4, "Migration `0042_split_invoice_address` is ready and tested locally. I need your approval to run it on **staging**."],
    ],
    runs: [{ id: "run-migration-1", status: "running", started: 17 }],
    request: {
      id: "req-migrate",
      kind: "command",
      at: 3,
      item: { type: "approval_request", requestId: "req-migrate", requestKind: "command", prompt: "bun run db:migrate --env staging", reason: "Apply migration 0042 to the staging database" },
    },
    thread: { activeRunId: "run-migration-1", runtimeMode: "approval-required" },
  },
  {
    id: "demo-onboarding",
    projectId: "demo-mobile",
    title: "Write the onboarding screens",
    model: SONNET,
    status: "waiting",
    messages: [
      ["user", 26, "Draft the copy for the new onboarding flow of the mobile app."],
      ["assistant", 9, "I have a first draft for each screen. Two choices change the whole flow, so I'd like your input first."],
    ],
    runs: [{ id: "run-onboarding-1", status: "running", started: 25 }],
    request: {
      id: "req-tone",
      kind: "user_input",
      at: 9,
      item: {
        type: "user_input_request",
        requestId: "req-tone",
        questions: [
          {
            id: "tone",
            header: "Tone",
            question: "Which tone should the onboarding use?",
            options: [
              { label: "Friendly", description: "Warm and simple, first names" },
              { label: "Professional", description: "Clear and neutral" },
              { label: "Playful", description: "Light jokes and emoji" },
            ],
          },
          { id: "steps", header: "Length", question: "How many screens?", options: [{ label: "3 screens" }, { label: "5 screens" }], allowCustomAnswer: true },
        ],
      },
    },
    thread: { activeRunId: "run-onboarding-1", runtimeMode: "full-access" },
  },
  {
    id: "demo-dark-mode",
    projectId: "demo-atlas-web",
    title: "Fix dark mode contrast on charts",
    model: SONNET,
    status: "completed",
    messages: [
      ["user", 48, "Chart labels are almost invisible in dark mode."],
      [
        "assistant",
        25,
        "Fixed. Changes:\n\n- Axis labels and grid lines now use theme tokens instead of fixed grays.\n- Tooltip background follows `--surface-raised`.\n- All text passes WCAG AA (4.5:1) in both themes.\n\nTests and visual snapshots pass.",
      ],
    ],
    runs: [{ id: "run-dark-1", status: "completed", started: 47, completed: 25 }],
  },
  {
    id: "demo-release-notes",
    projectId: "demo-docs",
    title: "Release notes for 2.4",
    model: CLAUDE,
    status: "completed",
    messages: [
      ["user", 75, "Write the 2.4 release notes from the merged pull requests."],
      [
        "assistant",
        62,
        "## Atlas 2.4\n\n**New**\n- Shared dashboards with view-only links\n- CSV export for every report\n\n**Improved**\n- Checkout loads 30% faster\n- Dark mode charts are easier to read\n\n**Fixed**\n- Duplicate emails after a password reset\n\nThe draft is in `docs/releases/2.4.md`.",
      ],
    ],
    runs: [{ id: "run-notes-1", status: "completed", started: 74, completed: 62 }],
  },
  {
    id: "demo-flaky-test",
    projectId: "demo-atlas-api",
    title: "Investigate the flaky webhook test",
    model: CODEX,
    status: "completed",
    messages: [
      ["user", 190, "`payments/webhook.test.ts` fails about once in ten runs on CI. Find out why."],
      ["assistant", 171, "The test depended on the order of two async events. It now waits for both events before it checks the result. 200 runs in a row pass on CI."],
    ],
    runs: [{ id: "run-flaky-1", status: "completed", started: 189, completed: 171 }],
  },
  {
    id: "demo-charts",
    projectId: SCRATCH_PROJECT_ID,
    title: "Compare charting libraries",
    model: CLAUDE,
    status: "completed",
    messages: [
      ["user", 140, "Compare three charting libraries for the analytics page."],
      [
        "assistant",
        128,
        "| Library | Bundle | Accessibility | Notes |\n| --- | --- | --- | --- |\n| Recharts | 95 kB | Partial | Easy React API |\n| Visx | 40 kB | Manual | Flexible, more code |\n| ECharts | 320 kB | Good | Many chart types |\n\nI recommend **Visx**: smallest bundle, and we already build our own components.",
      ],
    ],
    runs: [{ id: "run-charts-1", status: "completed", started: 139, completed: 128 }],
  },
  {
    id: "demo-digest",
    projectId: "demo-assistant",
    title: "Weekly product digest",
    model: SONNET,
    status: "completed",
    messages: [
      ["user", 1500, "Write this week's product digest."],
      ["assistant", 1490, "This week: 14 pull requests merged, 3 bugs closed, and the 2.4 release is ready for review. Full digest posted in the team channel."],
    ],
    runs: [{ id: "run-digest-1", status: "completed", started: 1499, completed: 1490 }],
    thread: { settledOverride: "settled", settledAt: LAST },
  },
  {
    id: "demo-deep-links",
    projectId: "demo-mobile",
    title: "Push notification deep links",
    model: CLAUDE,
    status: "completed",
    messages: [
      ["user", 1700, "Notification taps should open the right screen, not the home screen."],
      ["assistant", 1650, "Done: each notification now carries a route, and the app opens it after login. Tested on iOS and Android simulators."],
    ],
    runs: [{ id: "run-links-1", status: "completed", started: 1695, completed: 1650 }],
    thread: { settledOverride: "settled", settledAt: LAST },
  },
  {
    id: "demo-dev-server",
    projectId: "demo-atlas-web",
    title: "Profile the product page build",
    model: CLAUDE,
    status: "completed",
    messages: [
      ["user", 30, "Profile the product page build and keep the dev server up while you look."],
      ["assistant", 25, "The dev server runs in the background on port 5173. The run is over, but the server still runs."],
    ],
    runs: [{ id: "run-profile-1", status: "completed", started: 29, completed: 25 }],
    thread: { pendingBackgroundTasks: [{ taskId: "bg-dev-server", kind: "shell", description: "bun run dev (port 5173)" }] },
  },
];

function buildThread(spec: ThreadSpec, at: (minutes: number) => string): { thread: RawThread; projection: RawProjection } {
  const messages = spec.messages.map(([role, minutes, text], index) => ({ id: `${spec.id}-m${index}`, role, text, createdAt: at(minutes) }));
  const last = messages.at(-1)!;
  const lastUser = messages.findLast((message) => message.role === "user");
  const runs = (spec.runs ?? []).map((run) => ({ id: run.id, status: run.status, startedAt: at(run.started), completedAt: run.completed === undefined ? null : at(run.completed) }));
  const latestRun = runs.at(-1);
  const activity = (spec.activity ?? []).map(({ at: started, done, ...item }, index) => ({ ...item, ordinal: index + 1, status: item.status ?? (done === undefined ? "running" : "completed"), startedAt: at(started), completedAt: done === undefined ? null : at(done) }));
  const subagents = (spec.subagents ?? []).map(({ at: started, done, ...raw }) => ({ ...raw, startedAt: at(started), completedAt: done === undefined ? null : at(done) }));
  const { request } = spec;
  // A field set to LAST takes the time of the last message.
  const stamped = Object.fromEntries(Object.entries(spec.thread ?? {}).map(([key, value]) => [key, value === LAST ? last.createdAt : value]));
  const thread: RawThread = {
    id: spec.id,
    projectId: spec.projectId,
    title: spec.title,
    providerInstanceId: spec.model.instanceId,
    modelSelection: spec.model,
    runtimeMode: "full-access",
    status: spec.status,
    createdAt: messages[0]!.createdAt,
    updatedAt: last.createdAt,
    latestUserMessageAt: lastUser?.createdAt ?? null,
    latestRunStartedAt: latestRun?.startedAt ?? null,
    latestRunCompletedAt: latestRun?.completedAt ?? null,
    activityRunStartedAt: latestRun && !latestRun.completedAt ? latestRun.startedAt : null,
    latestVisibleMessage: { role: last.role, text: last.text, updatedAt: last.createdAt },
    pendingRuntimeRequest: request ? { id: request.id, kind: request.kind } : null,
    ...stamped,
  };
  const projection: RawProjection = {
    thread,
    messages,
    runs,
    visibleTurnItems: messages.map((message) => ({ id: `${message.id}-item`, messageId: message.id })),
    turnItems: [...activity, ...(request ? [request.item] : [])],
    subagents,
    runtimeRequests: request ? [{ id: request.id, kind: request.kind, status: "pending", createdAt: at(request.at), responseCapability: { type: "live" } }] : [],
  };
  return { thread, projection };
}

const effort = (id: string, levels: string[], defaultLevel: string) => ({
  capabilities: { optionDescriptors: [{ id, label: "Reasoning", type: "select", options: levels.map((level) => ({ id: level, label: level[0]!.toUpperCase() + level.slice(1), isDefault: level === defaultLevel })) }] },
});

const CONFIG: RawConfig = {
  providers: [
    {
      instanceId: "claudeAgent",
      displayName: "Claude",
      enabled: true,
      status: "ready",
      models: [
        { slug: "claude-opus-5-5", name: "Claude Opus 5.5", ...effort("effort", ["low", "medium", "high", "max"], "high") },
        { slug: "claude-sonnet-5", name: "Claude Sonnet 5", ...effort("effort", ["low", "medium", "high"], "medium") },
        { slug: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      ],
    },
    {
      instanceId: "codex",
      displayName: "Codex",
      enabled: true,
      status: "ready",
      models: [
        { slug: "gpt-5.5-codex", name: "GPT-5.5 Codex", ...effort("reasoningEffort", ["low", "medium", "high"], "medium") },
        { slug: "gpt-5.5", name: "GPT-5.5", ...effort("reasoningEffort", ["minimal", "low", "medium", "high"], "medium") },
      ],
    },
  ],
  settings: {
    defaultModelSelection: { ...CLAUDE, options: [{ id: "effort", value: "high" }] },
    defaultRuntimeMode: "full-access",
    favorites: [
      { provider: "claudeAgent", model: "claude-opus-5-5" },
      { provider: "codex", model: "gpt-5.5-codex" },
    ],
  },
  environment: { serverVersion: "demo", orchestrationProtocolVersion: 2, capabilities: { threadStop: true } },
};

export interface DemoFixtures {
  projects: RawProject[];
  threads: RawThread[];
  projections: Record<string, RawProjection>;
  config: RawConfig;
}

export function demoFixtures(now: Date): DemoFixtures {
  const at = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const built = SPECS.map((spec) => buildThread(spec, at));
  return {
    projects: PROJECTS,
    threads: built.map(({ thread }) => thread),
    projections: Object.fromEntries(built.map(({ thread, projection }) => [thread.id, projection])),
    config: CONFIG,
  };
}

const ISSUES: Array<[string, string, string, number, string | null, number]> = [
  ["Show totals first in the checkout summary", "In Progress", "started", 2, "Checkout", 10],
  ["Rate limit the public API", "In Progress", "started", 1, "Public API", 15],
  ["Split the invoice address into fields", "In Review", "started", 2, "Billing", 40],
  ["Onboarding copy for the mobile app", "In Review", "started", 3, "Mobile", 90],
  ["CSV export for every report", "Todo", "unstarted", 2, "Reports", 200],
  ["Flaky payment webhook test on CI", "Todo", "unstarted", 1, "Billing", 300],
  ["Keyboard shortcuts in the report builder", "Todo", "unstarted", 4, "Reports", 1500],
  ["Shared dashboards with view-only links", "Backlog", "backlog", 3, "Reports", 2900],
  ["Dark mode for email templates", "Backlog", "backlog", 4, null, 4300],
  ["Audit log for admin actions", "Backlog", "backlog", 0, "Public API", 7000],
  ["Dark mode contrast on charts", "Done", "completed", 3, "Reports", 25],
];

const STATE_COLORS: Record<string, string> = { Backlog: "#bec2c8", Todo: "#e2e2e2", "In Progress": "#f2c94c", "In Review": "#5e6ad2", Done: "#4cb782" };
const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"];

export function demoIssues(now: Date): LinearIssueNode[] {
  return ISSUES.map(([title, state, type, priority, project, minutes], index) => {
    const identifier = `ATL-${142 + index * 7}`;
    return {
      id: `demo-issue-${index}`,
      identifier,
      title,
      url: `https://linear.app/atlas/issue/${identifier.toLowerCase()}`,
      priority,
      priorityLabel: PRIORITY_LABELS[priority]!,
      updatedAt: new Date(now.getTime() - minutes * 60_000).toISOString(),
      state: { name: state, type, color: STATE_COLORS[state]! },
      project: project ? { id: `demo-linear-${project.toLowerCase().replace(/\s+/g, "-")}`, name: project } : null,
      team: { key: "ATL", name: "Atlas" },
    };
  });
}

const hoursFrom = (now: Date, hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

/** Scheduled tasks as T3 lists them: one bound to a dedicated thread, one unbound, one reminder on a normal conversation. */
export function demoScheduledTasks(now: Date): RawScheduledTask[] {
  const common = { enabled: true, createdBy: "agent", creationSource: "tool", createdAt: hoursFrom(now, -72) };
  return [
    {
      ...common,
      id: "inbox-triage",
      title: "Morning inbox triage",
      prompt: "Triage the inbox and list what needs an answer today.",
      schedule: { type: "fixed_time", timeOfDay: "08:00", weekdays: [1, 2, 3, 4, 5] },
      projectId: "demo-assistant",
      threadId: null,
      modelSelection: SONNET,
      nextRunAt: hoursFrom(now, 14),
      lastRunAt: hoursFrom(now, -10),
      lastRunStatus: "succeeded",
    },
    {
      ...common,
      id: "weekly-digest",
      title: "Weekly product digest",
      prompt: "Write this week's product digest.",
      schedule: { type: "fixed_time", timeOfDay: "17:00", weekdays: [5] },
      projectId: "demo-assistant",
      threadId: "demo-digest",
      modelSelection: SONNET,
      nextRunAt: hoursFrom(now, 60),
      lastRunAt: hoursFrom(now, -100),
      lastRunStatus: "succeeded",
    },
    {
      ...common,
      id: "dependency-check",
      title: "Dependency update check",
      prompt: "Check for dependency updates and list the risky ones.",
      schedule: { type: "interval", everyMs: 6 * 3_600_000 },
      projectId: "demo-atlas-api",
      threadId: null,
      modelSelection: CODEX,
      nextRunAt: hoursFrom(now, 3),
      lastRunAt: hoursFrom(now, -3),
      lastRunStatus: "failed",
      lastRunError: "Could not reach the package registry.",
    },
    {
      ...common,
      id: "error-report",
      title: "Nightly error report",
      prompt: "Summarize last night's errors.",
      schedule: { type: "fixed_time", timeOfDay: "23:00" },
      projectId: "demo-atlas-api",
      threadId: null,
      modelSelection: { instanceId: "claudeAgent", model: "claude-haiku-4-5" },
      nextRunAt: hoursFrom(now, 9),
      lastRunStatus: "never",
    },
    {
      ...common,
      id: "launch-follow-up",
      title: "Reminder: Follow up on the 2.4 launch",
      prompt: "Remind me to follow up on the 2.4 launch. Then delete this scheduled task.",
      schedule: { type: "fixed_time", timeOfDay: "10:00" },
      projectId: "demo-docs",
      threadId: "demo-release-notes",
      modelSelection: null,
      nextRunAt: hoursFrom(now, 26),
    },
  ];
}

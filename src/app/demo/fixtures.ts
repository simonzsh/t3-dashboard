import type { ServerStats } from "../../../shared/api.ts";
import type { LinearIssueNode } from "../../integrations/linear/schemas.ts";
import type { RawConfig, RawProject, RawProjection, RawScheduledTask, RawSubagent, RawThread, RawTurnItem, RawUsageLimits, RawUsageSummary } from "../../integrations/t3/schemas.ts";

// Invented data for `bun run demo`: a small team building "Atlas", no real names.
// Times are minutes before `now`, so the page always reads "2 min ago", "yesterday"...

export const SCRATCH_PROJECT_ID = "demo-no-project";
export const DEMO_ENVIRONMENT_ID = "demo-environment";
export const DEMO_HOME = "/home/demo";
/** The folders of the demo machine, parents first: "~/src/" lists the four projects and a hidden one. */
export const DEMO_FOLDERS = [
  "/",
  "/home",
  DEMO_HOME,
  `${DEMO_HOME}/src`,
  ...["atlas-web", "atlas-api", "sandbox", "notes"].map((name) => `${DEMO_HOME}/src/${name}`),
  `${DEMO_HOME}/.config`,
];
export const DEMO_FILES = [`${DEMO_HOME}/todo.txt`];
const CHILD_ID = "demo-checkout-mobile-child";

const PROJECTS: RawProject[] = [
  { id: "demo-atlas-web", title: "Atlas Web", workspaceRoot: `${DEMO_HOME}/src/atlas-web`, projectIcon: { kind: "lucide", name: "folder-code", color: "blue" } },
  { id: "demo-atlas-api", title: "Atlas API", workspaceRoot: `${DEMO_HOME}/src/atlas-api`, projectIcon: { kind: "lucide", name: "folder-tree", color: "green" } },
  { id: "demo-mobile", title: "Mobile App", projectIcon: { kind: "lucide", name: "smartphone", color: "purple" } },
  { id: "demo-docs", title: "Docs site", projectIcon: { kind: "lucide", name: "book-open", color: "gray" } },
  { id: "demo-assistant", title: "Assistant", projectIcon: { kind: "lucide", name: "brain", color: "purple" } },
  { id: SCRATCH_PROJECT_ID, title: "No project" },
  { id: "demo-sandbox", title: "Sandbox", workspaceRoot: `${DEMO_HOME}/src/sandbox` },
];

const SUMMARY_DIFF = [
  "--- a/web/src/checkout/OrderSummary.tsx",
  "+++ b/web/src/checkout/OrderSummary.tsx",
  "@@ -10,7 +10,9 @@ export function OrderSummary({ order }: Props) {",
  "   return (",
  '     <section className="summary">',
  "-      <Row label=\"Shipping\" value={order.shipping} />",
  "-      <Row label=\"Taxes\" value={order.taxes} />",
  "+      <Fees order={order} />",
  "+      <Total value={order.total} />",
  "     </section>",
  "   );",
  " }",
].join("\n");

const CLAUDE = { instanceId: "claudeAgent", model: "claude-opus-5-5" };
const SONNET = { instanceId: "claudeAgent", model: "claude-sonnet-5" };
const CODEX = { instanceId: "codex", model: "gpt-5.5-codex" };

type Role = "user" | "assistant";
const LAST = "@last-message";
export const DEMO_CONTEXT_TOKENS = 1_000_000;

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
  /** Context size the provider reported for the last turn. */
  tokens?: number;
}

const DAY = 1440;

interface DemoRun {
  id: string;
  title: string;
  projectId: string;
  prompt: string;
  /** Minutes before now. */
  started: number;
  outcome: "completed" | "failed" | "running";
  answer?: string;
}

// The run threads of the demo tasks: T3 ties each to its task by project, title and origin.
const runSpec = ({ id, title, projectId, prompt, started, outcome, answer = "Done." }: DemoRun): ThreadSpec => ({
  id,
  projectId,
  title,
  model: SONNET,
  status: outcome === "running" ? "running" : outcome,
  messages: outcome === "running" ? [["user", started, prompt]] : [["user", started, prompt], ["assistant", started - 3, answer]],
  runs: [{ id: `run-${id}`, status: outcome, started, ...(outcome === "running" ? {} : { completed: started - 3 }) }],
  thread: { creationSource: "mcp", ...(outcome === "running" && { activeRunId: `run-${id}` }), ...(outcome === "failed" && { lastError: answer }) },
});

const INBOX = { title: "Morning inbox triage", projectId: "demo-assistant", prompt: "Triage the inbox and list what needs an answer today." };
const DEPENDENCIES = { title: "Dependency update check", projectId: "demo-atlas-api", prompt: "Check for dependency updates and list the risky ones." };
const REVIEWS = { title: "PR review requests", projectId: "demo-atlas-api", prompt: "Review the pull request and list the risky changes." };

const AUTOMATION_RUNS: ThreadSpec[] = [
  runSpec({ ...INBOX, id: "demo-run-inbox-1", started: 600, outcome: "completed", answer: "4 mails need an answer today: the vendor invoice, two customer questions and the offsite booking." }),
  runSpec({ ...INBOX, id: "demo-run-inbox-2", started: 600 + DAY, outcome: "completed", answer: "2 mails need an answer today." }),
  runSpec({ ...INBOX, id: "demo-run-inbox-3", started: 600 + 2 * DAY, outcome: "failed", answer: "The mail connector timed out." }),
  runSpec({ ...INBOX, id: "demo-run-inbox-4", started: 600 + 3 * DAY, outcome: "completed", answer: "5 mails need an answer today." }),
  runSpec({ ...INBOX, id: "demo-run-inbox-5", started: 600 + 4 * DAY, outcome: "completed", answer: "1 mail needs an answer today." }),
  // Its newer run (3 h ago) failed before T3 opened a thread: see the task below.
  runSpec({ ...DEPENDENCIES, id: "demo-run-deps-1", started: 540, outcome: "failed", answer: "Could not reach the package registry." }),
  runSpec({ ...REVIEWS, id: "demo-run-review-1", started: 300, outcome: "completed", answer: "2 risky changes: a schema migration and a new public endpoint." }),
  runSpec({ ...REVIEWS, id: "demo-run-review-2", started: DAY + 300, outcome: "completed", answer: "No risky change." }),
  runSpec({ title: "Hourly metrics snapshot", projectId: "demo-atlas-api", prompt: "Snapshot the key metrics and flag any drop.", id: "demo-run-metrics-1", started: 64, outcome: "completed", answer: "All metrics are stable." }),
  runSpec({ title: "Hourly metrics snapshot", projectId: "demo-atlas-api", prompt: "Snapshot the key metrics and flag any drop.", id: "demo-run-metrics-2", started: 4, outcome: "running" }),
  runSpec({ title: "Reminder: Book the offsite room", projectId: "demo-assistant", prompt: "Remind me to book the offsite room.", id: "demo-run-offsite-1", started: 1200, outcome: "completed", answer: "Reminder: book the offsite room today." }),
];

const SPECS: ThreadSpec[] = [
  ...AUTOMATION_RUNS,
  {
    id: "demo-checkout",
    tokens: 722000,
    projectId: "demo-atlas-web",
    title: "ATL-142 Redesign the checkout summary",
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
      { id: "a1b", type: "todo_list", runId: "run-checkout-2", explanation: "Checkout summary", steps: [{ id: "t1", text: "Group the fees", status: "completed" }, { id: "t2", text: "Enlarge the total", status: "running" }, { id: "t3", text: "Update the snapshot tests", status: "pending" }], at: 6, done: 6 },
      { id: "a1c", type: "proposed_plan", runId: "run-checkout-2", markdown: "## Plan\n\n1. Group shipping, taxes and fees under **Fees**.\n2. Enlarge the total.\n3. Update the tests.", at: 6, done: 6 },
      { id: "a2", type: "command_execution", runId: "run-checkout-2", input: 'rg -n "OrderSummary" web/src', output: "web/src/checkout/OrderSummary.tsx:8:export function OrderSummary({ order }: Props) {\nweb/src/checkout/index.ts:1:export { OrderSummary } from \"./OrderSummary\";", exitCode: 0, at: 6, done: 6 },
      { id: "a3", type: "file_change", runId: "run-checkout-2", fileName: "web/src/checkout/OrderSummary.tsx", diffStr: SUMMARY_DIFF, additions: 2, deletions: 2, at: 5, done: 5 },
      { id: "a4", type: "subagent", runId: "run-checkout-2", subagentId: "sub-format", driver: "claudeAgent", providerInstanceId: "claudeAgent", providerTurnId: "turn-checkout-2", title: "Audit price formatting helpers", result: "Two helpers format prices: `formatPrice` and `toCurrency`. Only `formatPrice` handles locales; the summary now uses it everywhere.", at: 5, done: 3 },
      { id: "a5", type: "subagent", runId: "run-checkout-2", subagentId: "sub-mobile", driver: "claudeAgent", providerInstanceId: "claudeAgent", providerTurnId: "turn-checkout-2", childThreadId: CHILD_ID, title: "Check mobile breakpoints", progress: "Testing 375 px and 768 px widths", status: "running", at: 4 },
      { id: "a6", type: "file_change", runId: "run-checkout-2", fileName: "web/src/checkout/summary.css", oldStr: ".total { font-size: 14px; }", newStr: ".total { font-size: 20px; font-weight: 600; }", at: 3, done: 3 },
      { id: "a6b", type: "checkpoint", runId: "run-checkout-2", files: [{ fileName: "web/src/checkout/OrderSummary.tsx" }, { fileName: "web/src/checkout/summary.css" }], filesTotal: 2, at: 3, done: 3 },
      { id: "a7", type: "command_execution", runId: "run-checkout-2", input: "bun test web/src/checkout", output: JSON.stringify({ stdout: "web/src/checkout/OrderSummary.test.tsx\n  ✓ shows the total first\n  ✓ groups the fees\n\n 2 pass\n 0 fail", stderr: "", interrupted: false }), exitCode: 0, at: 2, done: 2 },
      { id: "a7b", type: "command_execution", runId: "run-checkout-2", input: "bun run typecheck", output: "web/src/checkout/Fees.tsx(4,10): error TS2305: Module './format' has no exported member 'toCurrency'.", exitCode: 2, at: 2, done: 2 },
      { id: "a8", type: "dynamic_tool", runId: "run-checkout-2", toolName: "mcp__browser__preview_open", input: { url: "http://localhost:5173/checkout" }, output: [{ type: "text", text: "Opened http://localhost:5173/checkout (375 x 812)" }], at: 2, done: 1 },
      { id: "a8b", type: "compaction", runId: "run-checkout-2", summary: "Earlier steps were summarized to save context.", beforeTokenCount: 84000, afterTokenCount: 12000, at: 1, done: 1 },
      { id: "a9", type: "reasoning", runId: "run-checkout-2", text: "Compare the new layout with the design spec.", status: "running", at: 1 },
    ],
    subagents: [
      { id: "sub-format", runId: "run-checkout-2", title: "Audit price formatting helpers", status: "completed", result: "Two helpers format prices: `formatPrice` and `toCurrency`. Only `formatPrice` handles locales; the summary now uses it everywhere.", at: 5, done: 3 },
      { id: "sub-mobile", runId: "run-checkout-2", childThreadId: CHILD_ID, title: "Check mobile breakpoints", status: "running", progress: "Testing 375 px and 768 px widths", at: 4 },
    ],
    thread: { activeRunId: "run-checkout-2", runtimeMode: "full-access", pinnedAt: LAST },
  },
  {
    id: "demo-rate-limit",
    projectId: "demo-atlas-api",
    title: "ATL-149 Add rate limiting to public endpoints",
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
      { id: "b2b", type: "file_search", runId: "run-rate-1", pattern: "rateLimit", results: [{ fileName: "src/middleware/index.ts", preview: 'export { rateLimit } from "./rateLimit";' }], at: 9, done: 9 },
      { id: "b2c", type: "web_search", runId: "run-rate-1", patterns: ["Retry-After header token bucket"], results: [{ title: "Retry-After - HTTP | MDN", url: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Retry-After", snippet: "The Retry-After response header tells the client how long to wait." }], at: 8, done: 8 },
      { id: "b3", type: "file_change", runId: "run-rate-1", fileName: "src/middleware/rateLimit.ts", diffStr: "--- /dev/null\n+++ b/src/middleware/rateLimit.ts\n@@ -0,0 +1,2 @@\n+export const rateLimit = bucket({ capacity: 60, refillPerSecond: 1 });\n+export default rateLimit;", additions: 2, deletions: 0, at: 6, done: 6 },
      { id: "b3b", type: "error", runId: "run-rate-1", failure: { class: "provider", message: "The provider was overloaded. Retrying in 5 s." }, at: 3, done: 3 },
      { id: "b3d", type: "secret_request", runId: "run-rate-1", label: "Webhook signing secret", reason: "The agent signs the webhook it creates with this secret.", placeholder: "Paste the secret", secretStatus: "pending", at: 2 },
      { id: "b3c", type: "system_notice", runId: "run-rate-1", message: "Switched to the fallback model.", at: 2, done: 2 },
      { id: "b4", type: "command_execution", runId: "run-rate-1", input: "bun test src/middleware", status: "running", at: 1 },
    ],
    thread: { activeRunId: "run-rate-1", runtimeMode: "auto-accept-edits" },
  },
  {
    id: "demo-migration",
    tokens: 722000,
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
    id: "demo-setup",
    projectId: "demo-assistant",
    title: "Remind me to book the offsite",
    model: SONNET,
    status: "running",
    messages: [["user", 1, "Create a scheduled task for this request: remind me to book the offsite on Friday."]],
    runs: [{ id: "run-setup-1", status: "running", started: 1 }],
    thread: { activeRunId: "run-setup-1" },
  },
  {
    id: "demo-dark-mode",
    tokens: 39700,
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
    tokens: 1500,
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
      ["user", 10000, "The webhook test failed on CI again. Is it the same cause?"],
      ["assistant", 9980, "No. This time the fixture reused a port. Each test now asks the system for a free port."],
      ["user", 4400, "Add a retry log to the webhook test so we see the next flaky failure."],
      ["assistant", 4380, "Done: a failed attempt now logs the event order before the test retries."],
      ["user", 190, "`payments/webhook.test.ts` fails about once in ten runs on CI. Find out why."],
      ["assistant", 171, "The test depended on the order of two async events. It now waits for both events before it checks the result. 200 runs in a row pass on CI."],
    ],
    runs: [{ id: "run-flaky-test-old0", status: "completed", started: 9999, completed: 9980 }, { id: "run-flaky-test-old1", status: "completed", started: 4399, completed: 4380 }, { id: "run-flaky-1", status: "completed", started: 189, completed: 171 }],
  },
  {
    id: "demo-charts",
    tokens: 265000,
    projectId: SCRATCH_PROJECT_ID,
    title: "Compare charting libraries",
    model: CLAUDE,
    status: "completed",
    messages: [
      ["user", 2900, "List the charts the analytics page needs."],
      ["assistant", 2880, "Four charts: revenue by day, signups, retention and a funnel."],
      ["user", 140, "Compare three charting libraries for the analytics page."],
      [
        "assistant",
        128,
        "| Library | Bundle | Accessibility | Notes |\n| --- | --- | --- | --- |\n| Recharts | 95 kB | Partial | Easy React API |\n| Visx | 40 kB | Manual | Flexible, more code |\n| ECharts | 320 kB | Good | Many chart types |\n\nI recommend **Visx**: smallest bundle, and we already build our own components.",
      ],
    ],
    runs: [{ id: "run-charts-old0", status: "completed", started: 2899, completed: 2880 }, { id: "run-charts-1", status: "completed", started: 139, completed: 128 }],
  },
  {
    id: "demo-digest",
    projectId: "demo-assistant",
    title: "Weekly product digest",
    model: SONNET,
    status: "completed",
    messages: [
      ["user", 11000, "Write last week's product digest."],
      ["assistant", 10990, "Last week: 11 pull requests merged, 5 bugs closed. The digest is in the team channel."],
      ["user", 1500, "Write this week's product digest."],
      ["assistant", 1490, "This week: 14 pull requests merged, 3 bugs closed, and the 2.4 release is ready for review. Full digest posted in the team channel."],
    ],
    runs: [{ id: "run-digest-old0", status: "completed", started: 10999, completed: 10990 }, { id: "run-digest-1", status: "completed", started: 1499, completed: 1490 }],
    thread: { settledOverride: "settled", settledAt: LAST },
  },
  {
    id: "demo-deep-links",
    projectId: "demo-mobile",
    title: "Push notification deep links",
    model: CLAUDE,
    status: "completed",
    messages: [
      ["user", 13000, "Which screens can a notification open today?"],
      ["assistant", 12980, "Three screens: the inbox, an order and the settings. Other routes fall back to the home screen."],
      ["user", 3000, "Add the order route to the notification payload."],
      ["assistant", 2980, "Done: the payload carries `orderId`, and the app opens the order after login."],
      ["user", 1700, "Notification taps should open the right screen, not the home screen."],
      ["assistant", 1650, "Done: each notification now carries a route, and the app opens it after login. Tested on iOS and Android simulators."],
    ],
    runs: [{ id: "run-deep-links-old0", status: "completed", started: 12999, completed: 12980 }, { id: "run-deep-links-old1", status: "completed", started: 2999, completed: 2980 }, { id: "run-links-1", status: "completed", started: 1695, completed: 1650 }],
    thread: { settledOverride: "settled", settledAt: LAST },
  },
  {
    id: "demo-dev-server",
    projectId: "demo-atlas-web",
    title: "Profile the product page build",
    model: CLAUDE,
    status: "completed",
    messages: [
      ["user", 4000, "How long does the product page build take today?"],
      ["assistant", 3990, "The cold build takes 41 s. A warm build takes 6 s."],
      ["user", 30, "Profile the product page build and keep the dev server up while you look."],
      ["assistant", 25, "The dev server runs in the background on port 5173. The run is over, but the server still runs."],
    ],
    runs: [{ id: "run-dev-server-old0", status: "completed", started: 3999, completed: 3990 }, { id: "run-profile-1", status: "completed", started: 29, completed: 25 }],
    thread: { pendingBackgroundTasks: [{ taskId: "bg-dev-server", kind: "shell", description: "bun run dev (port 5173)" }] },
  },
];

// What the "Check mobile breakpoints" subagent did in its own thread.
function childProjection(at: (minutes: number) => string): RawProjection {
  const item = (id: string, ordinal: number, minutes: number, extra: RawTurnItem): RawTurnItem => ({ id, ordinal, threadId: CHILD_ID, runId: "run-child-1", status: "completed", startedAt: at(minutes), completedAt: at(minutes), ...extra });
  const thread: RawThread = { id: CHILD_ID, projectId: "demo-atlas-web", title: "Check mobile breakpoints", status: "running", activeRunId: "run-child-1", lineage: { relationshipToParent: "subagent", parentThreadId: "demo-checkout" }, creationSource: "provider", modelSelection: SONNET, createdAt: at(4), updatedAt: at(1) };
  return {
    thread,
    messages: [],
    runs: [{ id: "run-child-1", status: "running", startedAt: at(4), completedAt: null }],
    turnItems: [
      item("c1", 1, 4, { type: "reasoning", text: "Check the summary at 375 px and 768 px." }),
      item("c2", 2, 3, { type: "command_execution", input: "bun run test:visual --width 375", output: "375 px: totals fit on one line", exitCode: 0 }),
      item("c3", 3, 1, { type: "command_execution", input: "bun run test:visual --width 768", status: "running", completedAt: null }),
    ],
  };
}

function buildThread(spec: ThreadSpec, at: (minutes: number) => string): { thread: RawThread; projection: RawProjection } {
  const messages = spec.messages.map(([role, minutes, text], index) => ({ id: `${spec.id}-m${index}`, role, text, createdAt: at(minutes) }));
  const last = messages.at(-1)!;
  const lastUser = messages.findLast((message) => message.role === "user");
  const userMessages = messages.filter((message) => message.role === "user");
  const runs = (spec.runs ?? []).map((run, index) => ({ id: run.id, ordinal: index + 1, userMessageId: userMessages[index]?.id, status: run.status, startedAt: at(run.started), completedAt: run.completed === undefined ? null : at(run.completed) }));
  // The start checkpoint, then one per finished run: "Edit from here" rewinds to one of them.
  const checkpoints = [{ id: `${spec.id}-cp0`, scopeId: `${spec.id}-scope`, runId: null, status: "ready", ordinalWithinScope: 0, appRunOrdinal: null }, ...runs.filter((run) => run.completedAt).map((run) => ({ id: `${spec.id}-cp${run.ordinal}`, scopeId: `${spec.id}-scope`, runId: run.id, status: "ready", ordinalWithinScope: run.ordinal, appRunOrdinal: run.ordinal }))];
  const latestRun = runs.at(-1);
  const activity = (spec.activity ?? []).map(({ at: started, done, ...item }, index) => ({ ...item, threadId: spec.id, ordinal: index + 1, status: item.status ?? (done === undefined ? "running" : "completed"), startedAt: at(started), completedAt: done === undefined ? null : at(done) }));
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
    checkpoints,
    visibleTurnItems: messages.map((message) => ({ id: `${message.id}-item`, messageId: message.id })),
    turnItems: [...activity, ...(request ? [request.item] : [])],
    subagents,
    providerTurns: spec.tokens === undefined ? [] : [{ tokenUsage: { usedTokens: spec.tokens, maxTokens: DEMO_CONTEXT_TOKENS, updatedAt: last.createdAt } }],
    runtimeRequests: request ? [{ id: request.id, kind: request.kind, status: "pending", createdAt: at(request.at), responseCapability: { type: "live" } }] : [],
  };
  return { thread, projection };
}

const FAST_TOGGLE = { id: "fastMode", label: "Fast", type: "boolean" };
const FAST_TIER = { id: "serviceTier", label: "Speed", type: "select", options: [{ id: "default", label: "Standard", isDefault: true }, { id: "fast", label: "Fast" }] };

const effort = (id: string, levels: string[], defaultLevel: string, speed?: typeof FAST_TOGGLE | typeof FAST_TIER) => ({
  capabilities: {
    optionDescriptors: [
      { id, label: "Reasoning", type: "select", options: levels.map((level) => ({ id: level, label: level[0]!.toUpperCase() + level.slice(1), isDefault: level === defaultLevel })) },
      ...(speed ? [speed] : []),
    ],
  },
});

const CONFIG: RawConfig = {
  providers: [
    {
      instanceId: "claudeAgent",
      driver: "claudeAgent",
      displayName: "Claude",
      enabled: true,
      status: "ready",
      slashCommands: [
        { name: "compact", description: "Summarize the conversation and reduce context usage" },
        { name: "review", description: "Review the pending changes" },
        { name: "init", description: "Create a CLAUDE.md file for this project" },
        { name: "goal", description: "Keep working toward a goal until it is done", input: { hint: "Objective, or pause, resume, clear" } },
      ],
      skills: [
        { name: "simplify", path: "/demo/skills/simplify", enabled: true, displayName: "Simplify", shortDescription: "Review changed code for reuse and simplicity" },
        { name: "security-review", path: "/demo/skills/security-review", enabled: true, displayName: "Security review", shortDescription: "Review the pending changes for security issues" },
        { name: "release-notes", path: "/demo/skills/release-notes", enabled: true, displayName: "Release notes", shortDescription: "Write release notes for a change" },
      ],
      models: [
        { slug: "claude-opus-5-5", name: "Claude Opus 5.5", ...effort("effort", ["low", "medium", "high", "max"], "high", FAST_TOGGLE) },
        { slug: "claude-sonnet-5", name: "Claude Sonnet 5", ...effort("effort", ["low", "medium", "high"], "medium") },
        { slug: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      ],
    },
    {
      instanceId: "codex",
      driver: "codex",
      displayName: "Codex",
      enabled: true,
      status: "ready",
      slashCommands: [{ name: "compact", description: "Summarize the conversation and reduce context usage" }],
      skills: [{ name: "simplify", path: "/demo/skills/simplify", enabled: true, displayName: "Simplify", shortDescription: "Review changed code for reuse and simplicity" }],
      models: [
        { slug: "gpt-5.5-codex", name: "GPT-5.5 Codex", ...effort("reasoningEffort", ["low", "medium", "high"], "medium", FAST_TIER) },
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

const MIN = 60_000;
const SESSION_MINUTES = 300;
const WEEK_MINUTES = 10_080;

/** Limit windows by instance id, timed from `now`: one under, two on and two ahead of the pace. */
export function demoUsageLimits(now: Date): Record<string, RawUsageLimits> {
  const checkedAt = new Date(now.getTime() - MIN).toISOString();
  const window = (id: string, kind: string, label: string, usedPercent: number, windowDurationMins: number, leftMinutes: number) => ({
    id,
    kind,
    label,
    usedPercent,
    windowDurationMins,
    resetsAt: new Date(now.getTime() + leftMinutes * MIN).toISOString(),
  });
  return {
    claudeAgent: {
      checkedAt,
      windows: [
        window("five_hour", "session", "Session", 38, SESSION_MINUTES, 131),
        window("seven_day", "weekly", "Weekly", 41, WEEK_MINUTES, 4 * 1440 + 3 * 60),
        window("seven_day_sonnet", "weekly", "Weekly · Sonnet", 72, WEEK_MINUTES, 4 * 1440 + 3 * 60),
      ],
    },
    codex: {
      checkedAt,
      windows: [window("primary", "session", "Session", 91, SESSION_MINUTES, 150), window("secondary", "weekly", "Weekly", 23, WEEK_MINUTES, 5 * 1440 + 6 * 60)],
      resetCredits: { availableCount: 2 },
    },
  };
}

const GIB = 1024 ** 3;
const DEMO_BOOT = Date.parse("2026-10-20T08:00:00Z");
const WEEK_MS = 7 * 86_400_000;

/** An invented workstation whose numbers drift on slow sines, so the card visibly moves. */
export function demoServerStats(now: Date): ServerStats {
  const t = now.getTime();
  const wave = (periodMs: number) => (Math.sin((t / periodMs) * 2 * Math.PI) + 1) / 2;
  const memoryTotal = 32 * GIB;
  const memoryUsed = (11 + 3 * wave(97_000)) * GIB;
  const diskTotal = 512 * 1e9;
  const diskUsed = diskTotal * 0.78;
  return {
    host: "workstation",
    os: "Linux",
    // Loops over a week, so a screenshot taken any day shows a plausible uptime.
    uptimeSeconds: 12 * 86_400 + Math.floor((((t - DEMO_BOOT) % WEEK_MS) + WEEK_MS) % WEEK_MS / 1000),
    cpu: { usedPercent: 18 + 28 * wave(41_000), cores: 8 },
    memory: { usedBytes: memoryUsed, totalBytes: memoryTotal, usedPercent: (memoryUsed / memoryTotal) * 100 },
    disk: { path: "/home/demo", usedBytes: diskUsed, totalBytes: diskTotal, usedPercent: 78 },
    readAt: now.toISOString(),
  };
}

export interface DemoFixtures {
  projects: RawProject[];
  threads: RawThread[];
  projections: Record<string, RawProjection>;
  config: RawConfig;
  /** Threads the shell hides, such as a subagent's own thread: only their projection is served. */
  hiddenThreadIds: string[];
}

export function demoFixtures(now: Date): DemoFixtures {
  const at = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const built = SPECS.map((spec) => buildThread(spec, at));
  return {
    projects: PROJECTS,
    threads: built.map(({ thread }) => thread),
    projections: { ...Object.fromEntries(built.map(({ thread, projection }) => [thread.id, projection])), [CHILD_ID]: childProjection(at) },
    config: CONFIG,
    hiddenThreadIds: [CHILD_ID],
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
  const common = { enabled: true, createdBy: "agent", creationSource: "mcp", createdAt: hoursFrom(now, -72), runtimeMode: "full-access" };
  return [
    {
      ...common,
      id: "inbox-triage",
      createdAt: hoursFrom(now, -6 * 24),
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
      runtimeMode: "approval-required",
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
      id: "metrics-snapshot",
      title: "Hourly metrics snapshot",
      prompt: "Snapshot the key metrics and flag any drop.",
      schedule: { type: "interval", everyMs: 3_600_000 },
      projectId: "demo-atlas-api",
      threadId: null,
      modelSelection: SONNET,
      nextRunAt: hoursFrom(now, 1),
      lastRunAt: hoursFrom(now, -4 / 60),
      lastRunStatus: "running",
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
      prompt: "Remind me to follow up on the 2.4 launch.",
      schedule: { type: "fixed_time", timeOfDay: "10:00" },
      projectId: "demo-docs",
      threadId: "demo-release-notes",
      modelSelection: null,
      nextRunAt: hoursFrom(now, 26),
    },
    {
      ...common,
      id: "offsite-reminder",
      title: "Reminder: Book the offsite room",
      prompt: "Remind me to book the offsite room.",
      enabled: false,
      schedule: { type: "fixed_time", timeOfDay: "14:00" },
      projectId: "demo-assistant",
      threadId: null,
      modelSelection: SONNET,
      lastRunAt: hoursFrom(now, -20),
      lastRunStatus: "succeeded",
    },
    {
      ...common,
      id: "pr-review",
      title: "PR review requests",
      prompt: "Review the pull request {{body.pull_request.html_url}} and list the risky changes.",
      schedule: { type: "webhook", signature: { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=" }, filters: [{ path: "body.action", op: "equals", value: "opened" }] },
      webhook: { url: "https://relay.example.invalid/v1/hooks/demo/pr-review/token", hasSecret: true },
      projectId: "demo-atlas-api",
      threadId: null,
      modelSelection: SONNET,
      lastRunAt: hoursFrom(now, -5),
      lastRunStatus: "succeeded",
    },
    {
      ...common,
      id: "deploy-hook",
      title: "Deploy notifications",
      prompt: "Summarize the deployment {{body.deployment.id}}.",
      schedule: { type: "webhook" },
      webhook: { url: null, hasSecret: false },
      enabled: false,
      projectId: "demo-atlas-api",
      threadId: null,
      modelSelection: null,
    },
  ];
}

const USAGE_MODELS = [
  { share: 0.55, price: 1.6, costSource: "modelPriced" },
  { share: 0.3, price: 0.9, costSource: "modelPriced" },
  // A model T3 has no rate for: the demo shows the "partial" cost state.
  { share: 0.15, price: 0, costSource: "unpriced" },
] as const;

// Fixed per-day weights (Monday-ish peaks), so the chart is the same on every run.
const USAGE_LOAD = [0.4, 0.7, 1, 0.9, 0.6, 0.2, 0.1, 0.5, 0.8, 1.1, 1, 0.7, 0.9, 0.8];

/** Usage buckets for the days `sinceDay` to `untilDay`, as T3's scan reports them, one per day and model. */
export function demoUsageBuckets(sinceDay: string, untilDay: string): RawUsageSummary {
  const buckets: RawUsageSummary["buckets"] = [];
  const end = Date.parse(`${untilDay}T00:00:00Z`);
  const count = Math.round((end - Date.parse(`${sinceDay}T00:00:00Z`)) / 86_400_000) + 1;
  for (let index = 0; index < count; index++) {
    const day = new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    const load = USAGE_LOAD[index % USAGE_LOAD.length]!;
    for (const { share, price, costSource } of USAGE_MODELS) {
      const input = Math.round(load * share * 4_000_000);
      const cached = Math.round(input * 0.7);
      buckets.push({
        day,
        costUsd: Math.round(load * share * price * 3_000) / 100,
        costSource,
        unpricedRecords: costSource === "unpriced" ? Math.ceil(load * 12) : 0,
        totals: { uncachedInputTokens: input - cached, cachedInputTokens: cached, cacheCreationTokens: Math.round(input * 0.05), outputTokens: Math.round(load * share * 300_000) },
      });
    }
  }
  return { buckets };
}

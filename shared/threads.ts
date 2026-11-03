// Threads, projects, providers and the thread detail, as the web shows them.

export interface ModelSelection {
  instanceId: string;
  model: string;
  options?: Array<{ id: string; value: unknown }>;
}

export type RuntimeMode = "approval-required" | "auto-accept-edits" | "auto" | "full-access";

export type PendingCategory = "approval" | "user-input" | "other";

export interface DashboardThread {
  id: string;
  projectId: string;
  title: string;
  provider: string;
  status: string;
  /** In the T3 Code sidebar's Settled section. */
  settled: boolean;
  pending: { category: PendingCategory } | null;
  activeRunId: string | null;
  /** Subagents or a thread wait still run after the turn ended. */
  backgroundWork: boolean;
  /** The shell lists pending background tasks: subagents may run without a run. */
  pendingTasks: boolean;
  lastError: string | null;
  pinned: boolean;
  lastActivityAt: string;
}

/** The project's icon in T3 Code: SVG shapes on a 24×24 grid, drawn with a stroke. */
export interface ProjectIcon {
  shapes: Array<{ tag: string; attrs: Record<string, string> }>;
  color: string | null;
}

export interface DashboardProject {
  id: string;
  title: string;
  defaultModelSelection: ModelSelection | null;
  icon: ProjectIcon | null;
}

export interface ModelEffort {
  /** Option id in ModelSelection.options: "effort" for Claude, "reasoningEffort" for Codex. */
  optionId: string;
  levels: Array<{ id: string; label: string }>;
  defaultLevel: string | null;
}

export interface DashboardModel {
  slug: string;
  name: string;
  effort: ModelEffort | null;
  /** Rank in T3's favorites, or null when not a favorite. */
  favorite: number | null;
}

/** T3 Code's own settings for a new agent. */
export interface ModelDefaults {
  selection: ModelSelection | null;
  runtimeMode: RuntimeMode | null;
}

export interface DashboardProvider {
  instanceId: string;
  displayName: string;
  models: DashboardModel[];
  runtimeModes: RuntimeMode[];
}

/** A file or image the user sent; GET /api/threads/:id/attachments/:attachmentId serves it. */
export interface ChatAttachment {
  id: string;
  name: string;
  kind: "image" | "file";
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  streaming: boolean;
  attachments: ChatAttachment[];
  /** A user message the thread can rewind to before: its run ended and the checkpoint before it is ready. */
  rewindable: boolean;
}

/** A message T3 holds until the active turn ends (a run with status "queued"). */
export interface QueuedMessage {
  runId: string;
  messageId: string;
  text: string;
  attachments: ChatAttachment[];
  createdAt: string;
  /** T3 cannot edit a message a guest sent. */
  editable: boolean;
}

/** A page the agent showed with html_render; the same route serves it, sandboxed. */
export interface HtmlRender {
  id: string;
  attachmentId: string;
  title: string;
  height: number;
  createdAt: string;
}

export interface UserInputOption {
  label: string;
  description: string | null;
  value: string;
}

export interface UserInputQuestion {
  id: string;
  header: string | null;
  question: string;
  options: UserInputOption[];
  multiSelect: boolean;
  allowCustomAnswer: boolean;
  required: boolean;
}

export type PendingRequestDetail =
  | { category: "approval"; requestId: string; requestKind: string; prompt: string | null; reason: string | null; resumable: boolean }
  // dismissable: T3 drops the question without an answer only when a message can answer it.
  | { category: "user-input"; requestId: string; questions: UserInputQuestion[]; dismissable: boolean; resumable: boolean }
  | { category: "other"; requestId: string; requestKind: string; resumable: boolean };

export interface SubagentInfo {
  id: string;
  title: string;
  status: "running" | "done" | "failed";
  // Last step while running; null once finished.
  progress: string | null;
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
  // Which stop applies: the subagent itself, or the whole thread for a background task.
  stop: "subagent" | "thread" | null;
}

export type StepKind = "thinking" | "command" | "tool" | "file" | "search" | "web" | "todo" | "plan" | "subagent" | "notice";
export type StepStatus = "running" | "done" | "failed";

export interface TodoEntry {
  text: string;
  status: "pending" | "running" | "completed";
}

export interface SubagentStep {
  /** For POST /api/threads/:id/subagents/:subagentId/stop. */
  subagentId: string;
  /** GET /api/threads/:childThreadId shows its steps; the desk can open it. Null when T3 has none. */
  childThreadId: string | null;
  /** Last progress line while running; null once finished. */
  progress: string | null;
  /** Running with a run: Stop applies. */
  stoppable: boolean;
}

/** One agent step in the timeline. Texts are cut; GET /api/threads/:id/items/:itemId gives the rest. */
export interface TurnStep {
  id: string;
  runId: string | null;
  kind: StepKind;
  status: StepStatus;
  /** "" when T3 gives no time. */
  startedAt: string;
  completedAt: string | null;
  /** One line, at most 300 characters. */
  text: string;
  /** Second part, at most 300 characters. */
  detail: string | null;
  /** Expanding loads a StepDetail. */
  expandable: boolean;
  exitCode: number | null;
  /** Kind "todo": at most 50 entries. */
  todos?: TodoEntry[];
  /** Kind "plan": markdown, at most 20 000 characters. */
  markdown?: string;
  /** Kind "subagent". */
  subagent?: SubagentStep;
  /** Kind "notice". */
  notice?: "checkpoint" | "compaction" | "error" | "system" | "interrupt";
}

/** GET /api/threads/:id/items/:itemId */
export interface StepDetail {
  id: string;
  kind: StepKind;
  /** Command line, or tool input as pretty JSON; at most 20 000 characters. */
  input: string | null;
  /** Command output (stdout then stderr) or tool output text; the last 64 000 characters. */
  output: string | null;
  exitCode: number | null;
  /** Unified diff; at most 200 000 characters. */
  diff: string | null;
  /** Full thinking text, subagent result or plan; at most 64 000 characters. */
  text: string | null;
  /** Search results; at most 50. */
  results: Array<{ title: string; url: string | null; snippet: string | null }>;
  truncated: boolean;
}

/** The active run (or the latest one): its time span. Its steps are in ThreadDetail.steps. */
export interface RunActivity {
  runId: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ThreadDetail {
  threadId: string;
  thread: DashboardThread | null;
  messages: ChatMessage[];
  /** In T3's queue order. These messages are never in `messages`. */
  queue: QueuedMessage[];
  /** After a Stop, T3 holds the queue: nothing starts until "Send now". */
  queueHeld: boolean;
  renders: HtmlRender[];
  pendingRequests: PendingRequestDetail[];
  subagents: SubagentInfo[];
  /** The thread's current model, effort and access, as the composer shows them. */
  modelSelection: ModelSelection | null;
  runtimeMode: RuntimeMode | null;
  activity: RunActivity | null;
  /** Steps of every run, oldest first: the latest 400. */
  steps: TurnStep[];
  /** Older steps left out by the cap. */
  stepsOmitted: number;
}

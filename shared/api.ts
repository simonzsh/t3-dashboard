// Contract between the dashboard server (src/) and the web UI (web/).
// Types only: both sides import this file with `import type`.

export type Bucket = "todo" | "running" | "done" | "inactive";

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
  model: string | null;
  status: string;
  bucket: Bucket;
  pending: { requestId: string; kind: string; category: PendingCategory } | null;
  activeRunId: string | null;
  /** Subagents or a thread wait still run after the turn ended. */
  backgroundWork: boolean;
  /** The shell lists pending background tasks: subagents may run without a run. */
  pendingTasks: boolean;
  lastError: string | null;
  hasActionableProposedPlan: boolean;
  preview: { role: string; text: string } | null;
  pinned: boolean;
  branch: string | null;
  pullRequestUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface DashboardProject {
  id: string;
  title: string;
  defaultModelSelection: ModelSelection | null;
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
}

export interface DashboardProvider {
  instanceId: string;
  displayName: string;
  models: DashboardModel[];
  runtimeModes: RuntimeMode[];
}

export type SetupReason = "t3-missing" | "t3-stopped" | "token-needed";

export interface SetupInfo {
  reason: SetupReason;
  /** Short and safe to show: never a token or command output. */
  detail: string | null;
  issueCommand: string;
  installUrl: string;
}

export interface ConnectionStatus {
  t3: "connecting" | "live" | "offline" | "needs-token";
  origin: string | null;
  serverVersion: string | null;
  protocolMismatch: boolean;
  error: string | null;
  since: string;
  /** Not null: the UI shows the full-screen setup. */
  setup: SetupInfo | null;
}

export interface DashboardState {
  connection: ConnectionStatus;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  threads: DashboardThread[];
  generatedAt: string;
  /** At least one t3-agent brain file exists. */
  automationsAvailable: boolean;
  /** For t3code:// links; null hides the "Open in T3 Code" buttons. */
  t3EnvironmentId: string | null;
}

export interface Diff<T> {
  upserted: T[];
  removed: string[];
}

export type DashboardEvent =
  | { type: "state"; data: DashboardState }
  | { type: "threads"; data: Diff<DashboardThread> }
  | { type: "projects"; data: Diff<DashboardProject> }
  | { type: "providers"; data: DashboardProvider[] }
  | { type: "connection"; data: ConnectionStatus };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  streaming: boolean;
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
  | { category: "approval"; requestId: string; requestKind: string; prompt: string | null; reason: string | null; resumable: boolean; createdAt: string }
  | { category: "user-input"; requestId: string; questions: UserInputQuestion[]; resumable: boolean; createdAt: string }
  | { category: "other"; requestId: string; requestKind: string; resumable: boolean; createdAt: string };

export interface SubagentInfo {
  id: string;
  title: string;
  status: "running" | "done" | "failed";
  // Last step while running; null once finished.
  progress: string | null;
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ThreadDetail {
  threadId: string;
  thread: DashboardThread | null;
  messages: ChatMessage[];
  pendingRequests: PendingRequestDetail[];
  subagents: SubagentInfo[];
  /** The thread's current model, effort and access, as the composer shows them. */
  modelSelection: ModelSelection | null;
  runtimeMode: RuntimeMode | null;
}

export type ApprovalDecision = "accept" | "acceptForSession" | "decline";
export type UserInputAnswers = Record<string, string | string[]>;

export interface CreateThreadBody {
  projectId: string;
  title: string;
  text: string;
  modelSelection: ModelSelection;
}

export interface ImageAttachment {
  name: string;
  mimeType: string;
  /** `data:<mimeType>;base64,…` */
  dataUrl: string;
}

export interface SendMessageBody {
  text: string;
  mode?: "queue" | "steer";
  attachments?: ImageAttachment[];
}

export interface ThreadSettingsBody {
  modelSelection?: ModelSelection;
  runtimeMode?: RuntimeMode;
}

export type RespondBody = { decision: ApprovalDecision } | { answers: UserInputAnswers };

export interface OkResult {
  ok: true;
}

export interface CreateThreadResult {
  ok: true;
  threadId: string;
}

export interface ErrorResult {
  error: string;
}

export interface HealthResult {
  ok: true;
  t3: ConnectionStatus["t3"];
  /** Version of the running binary: lets install tell this dashboard from another program. */
  version: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string; type: string; color: string };
  priority: number;
  priorityLabel: string;
  project: { id: string; name: string } | null;
  team: { key: string; name: string };
  workspace: string;
  updatedAt: string;
}

export interface LinearWorkspaceStatus {
  name: string;
  ok: boolean;
  error: string | null;
}

export interface BoardResult {
  workspaces: LinearWorkspaceStatus[];
  issues: LinearIssue[];
  fetchedAt: string;
  /** False when no Linear key is set at all: the UI shows the setup card. */
  configured: boolean;
}

export interface AssignIssueBody {
  workspace: string;
  issueId: string;
  agent: "claude" | "codex";
  projectId: string;
}

export type TokenSource = "env-file" | "stored" | "issued" | "pasted";

export interface LinearSettings {
  connected: boolean;
  /** Last 4 characters at most: the key itself never leaves the server. */
  keyTail: string | null;
  /** The file uses the old workspaces list: the first save converts it and keeps the first workspace only. */
  legacy: boolean;
}

export interface SettingsResult {
  linear: LinearSettings;
  t3: { tokenSource: TokenSource | null };
  configDir: string;
}

export interface LinearKeyBody {
  apiKey: string;
}

export interface TokenBody {
  token: string;
}

export interface UpdateStatus {
  current: string;
  latest: string | null;
  available: boolean;
  checkedAt: string | null;
  canUpdate: boolean;
  /** One sentence that says why `canUpdate` is false. */
  reason: string | null;
  updating: boolean;
  /** Why the last update failed: the page shows it. */
  error: string | null;
}

export type AutomationSchedule = { kind: "cron"; cron: string; timeZone: string; label: string } | { kind: "once"; at: string };

export interface Automation {
  id: string;
  brain: string;
  kind: "routine" | "reminder";
  title: string;
  schedule: AutomationSchedule;
  nextRunAt: string | null;
  lastRunAt: string | null;
  threadId: string | null;
  model: string | null;
}

export interface BrainStatus {
  name: string;
  ok: boolean;
  error: string | null;
  problems: number;
}

export interface AutomationsResult {
  automations: Automation[];
  brains: BrainStatus[];
  fetchedAt: string;
}

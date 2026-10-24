// Contract between the dashboard server (src/) and the web UI (web/).
// Types only: both sides import this file with `import type`.

export type Bucket = "todo" | "running" | "done" | "inactive";

export interface ModelSelection {
  instanceId: string;
  model: string;
  options?: Array<{ id: string; value: unknown }>;
}

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

export interface DashboardProvider {
  instanceId: string;
  displayName: string;
  models: Array<{ slug: string; name: string }>;
}

export interface ConnectionStatus {
  t3: "connecting" | "live" | "offline";
  origin: string | null;
  serverVersion: string | null;
  protocolMismatch: boolean;
  error: string | null;
  since: string;
}

export interface DashboardState {
  connection: ConnectionStatus;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  threads: DashboardThread[];
  generatedAt: string;
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

export interface ThreadDetail {
  threadId: string;
  thread: DashboardThread | null;
  messages: ChatMessage[];
  pendingRequests: PendingRequestDetail[];
}

export type ApprovalDecision = "accept" | "acceptForSession" | "decline";
export type UserInputAnswers = Record<string, string | string[]>;

export interface CreateThreadBody {
  projectId: string;
  title: string;
  text: string;
  modelSelection: ModelSelection;
}

export interface SendMessageBody {
  text: string;
  mode?: "queue" | "steer";
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
  t3ProjectId: string | null;
}

export interface BoardResult {
  workspaces: LinearWorkspaceStatus[];
  issues: LinearIssue[];
  fetchedAt: string;
}

export interface AssignIssueBody {
  workspace: string;
  issueId: string;
  agent: "claude" | "codex";
}

import type { ModelSelection } from "../../shared/api.ts";

// Raw T3 shapes. Fields are optional because the server changes them between versions.
export interface RawThread {
  id: string;
  projectId?: string;
  title?: string | null;
  providerInstanceId?: string | null;
  modelSelection?: ModelSelection | null;
  branch?: string | null;
  linkedPullRequest?: { url?: string } | null;
  pullRequests?: Array<{ url?: string }> | null;
  lineage?: { relationshipToParent?: string | null } | null;
  creationSource?: string | null;
  status?: string | null;
  activeRunId?: string | null;
  activityRunStartedAt?: string | null;
  latestRunStartedAt?: string | null;
  latestRunCompletedAt?: string | null;
  latestUserMessageAt?: string | null;
  lastError?: string | null;
  pendingRuntimeRequest?: { id: string; kind: string } | null;
  latestVisibleMessage?: { role?: string; text?: string; updatedAt?: string | null } | null;
  hasActionableProposedPlan?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  settledOverride?: string | null;
  settledAt?: string | null;
  snoozedUntil?: string | null;
  pinnedAt?: string | null;
}

export interface RawProject {
  id: string;
  title?: string | null;
  defaultModelSelection?: ModelSelection | null;
}

export interface RawSnapshot {
  threads?: RawThread[];
  archivedThreads?: RawThread[];
  projects?: RawProject[];
}

// Unknown kinds can still arrive at runtime; consumers ignore them.
export type ShellItem =
  | { kind: "snapshot"; snapshot?: RawSnapshot }
  | { kind: "synchronized" }
  | { kind: "thread.updated"; thread: RawThread; location?: string }
  | { kind: "thread.removed"; threadId: string }
  | { kind: "project.updated"; project: RawProject }
  | { kind: "project.removed"; projectId: string };

export interface RawMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text?: string;
  streaming?: boolean;
  createdAt?: string;
}

export interface RawRuntimeRequest {
  id: string;
  kind?: string;
  status?: string;
  createdAt?: string;
  responseCapability?: { type?: string } | null;
}

export interface RawTurnItem {
  type?: string;
  requestId?: string;
  requestKind?: string;
  prompt?: string | null;
  reason?: string | null;
  questions?: Array<{
    id: string;
    header?: string | null;
    question?: string;
    options?: Array<{ label: string; description?: string | null; value?: string | null }>;
    multiSelect?: boolean;
    allowCustomAnswer?: boolean;
    required?: boolean;
  }>;
  messageId?: string;
}

export interface RawSubagent {
  id: string;
  runId?: string | null;
  title?: string | null;
  prompt?: string | null;
  status?: string | null;
  progress?: string | null;
  result?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface RawProjection {
  messages?: RawMessage[];
  runs?: Array<{ id: string; status?: string }>;
  runtimeRequests?: RawRuntimeRequest[];
  turnItems?: Array<{ item?: RawTurnItem } | RawTurnItem>;
  visibleTurnItems?: Array<{ item?: RawTurnItem } | RawTurnItem>;
  subagents?: RawSubagent[];
}

export interface RawProvider {
  instanceId: string;
  displayName?: string | null;
  enabled?: boolean;
  status?: string;
  models?: Array<{ slug: string; name?: string | null }>;
}

export interface RawConfig {
  providers?: RawProvider[];
  environment?: { serverVersion?: string | null; orchestrationProtocolVersion?: number | null };
}

export type Command = Record<string, unknown>;

export interface T3Port {
  threadProjection(threadId: string): Promise<RawProjection>;
  dispatch(command: Command): Promise<unknown>;
  getConfig(): Promise<RawConfig>;
  subscribeShell(onItems: (items: ShellItem[]) => void, onEnd: (error?: Error) => void): { cancel(): void };
}

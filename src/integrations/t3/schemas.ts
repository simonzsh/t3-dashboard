import { s, type Infer } from "../contract.ts";

// Raw T3 shapes, limited to the fields the dashboard reads.
// Fields are optional because the server changes them between versions.
const text = () => s.optional(s.nullable(s.string()));

export const ModelSelection = s.object({
  instanceId: s.string(),
  model: s.string(),
  options: s.optional(s.array(s.object({ id: s.string(), value: s.unknown() }))),
});

export const RawBackgroundTask = s.object({
  taskId: s.optional(s.string()),
  kind: s.optional(s.string()),
  description: text(),
  childThreadId: text(),
});
export type RawBackgroundTask = Infer<typeof RawBackgroundTask>;

export const RawThread = s.object({
  id: s.string(),
  projectId: s.optional(s.string()),
  title: text(),
  providerInstanceId: text(),
  modelSelection: s.optional(s.nullable(ModelSelection)),
  runtimeMode: text(),
  lineage: s.optional(s.nullable(s.object({ relationshipToParent: text() }))),
  creationSource: text(),
  status: text(),
  activeRunId: text(),
  pendingBackgroundTasks: s.optional(s.nullable(s.array(RawBackgroundTask))),
  blockedOnThreadWait: s.optional(s.nullable(s.boolean())),
  activityRunStartedAt: text(),
  latestRunStartedAt: text(),
  latestRunCompletedAt: text(),
  latestUserMessageAt: text(),
  lastError: text(),
  pendingRuntimeRequest: s.optional(s.nullable(s.object({ id: s.string(), kind: s.string() }))),
  latestVisibleMessage: s.optional(s.nullable(s.object({ role: s.optional(s.string()), text: s.optional(s.string()), updatedAt: text() }))),
  createdAt: text(),
  updatedAt: text(),
  archivedAt: text(),
  deletedAt: text(),
  settledOverride: text(),
  settledAt: text(),
  unsettledAt: text(),
  snoozedUntil: text(),
  pinnedAt: text(),
});
export type RawThread = Infer<typeof RawThread>;

export const RawProject = s.object({
  id: s.string(),
  title: text(),
  defaultModelSelection: s.optional(s.nullable(ModelSelection)),
});
export type RawProject = Infer<typeof RawProject>;

export const RawSnapshot = s.object({
  threads: s.optional(s.array(RawThread)),
  projects: s.optional(s.array(RawProject)),
});
export type RawSnapshot = Infer<typeof RawSnapshot>;

// Unknown kinds can still arrive at runtime; consumers ignore them.
export const ShellItem = s.variant("kind", {
  snapshot: s.object({ snapshot: s.optional(RawSnapshot) }),
  synchronized: s.object({}),
  "thread.updated": s.object({ thread: RawThread, location: s.optional(s.string()) }),
  "thread.removed": s.object({ threadId: s.string() }),
  "project.updated": s.object({ project: RawProject }),
  "project.removed": s.object({ projectId: s.string() }),
});
export type ShellItem = Infer<typeof ShellItem>;

export const RawMessage = s.object({
  id: s.string(),
  role: s.union(s.literal("user"), s.union(s.literal("assistant"), s.literal("system"))),
  text: s.optional(s.string()),
  streaming: s.optional(s.boolean()),
  createdAt: s.optional(s.string()),
  attachments: s.optional(s.nullable(s.array(s.object({ type: s.string(), id: s.string(), name: text() })))),
});

export const RawRuntimeRequest = s.object({
  id: s.string(),
  kind: s.optional(s.string()),
  status: s.optional(s.string()),
  createdAt: s.optional(s.string()),
  responseCapability: s.optional(s.nullable(s.object({ type: s.optional(s.string()) }))),
});
export type RawRuntimeRequest = Infer<typeof RawRuntimeRequest>;

const RawQuestion = s.object({
  id: s.string(),
  header: text(),
  question: s.optional(s.string()),
  options: s.optional(s.array(s.object({ label: s.string(), description: text(), value: text() }))),
  multiSelect: s.optional(s.boolean()),
  allowCustomAnswer: s.optional(s.boolean()),
  required: s.optional(s.boolean()),
});

export const RawTurnItem = s.object({
  type: s.optional(s.string()),
  requestId: s.optional(s.string()),
  requestKind: s.optional(s.string()),
  prompt: text(),
  reason: text(),
  questions: s.optional(s.array(RawQuestion)),
  messageId: s.optional(s.string()),
  id: s.optional(s.string()),
  runId: text(),
  ordinal: s.optional(s.number()),
  status: text(),
  title: text(),
  completedAt: text(),
  text: text(),
  input: s.optional(s.unknown()),
  toolName: text(),
  fileName: text(),
  exitCode: s.optional(s.nullable(s.number())),
  outputIndicatesFailure: s.optional(s.nullable(s.boolean())),
  startedAt: text(),
  output: s.optional(s.unknown()),
});
export type RawTurnItem = Infer<typeof RawTurnItem>;

export const RawSubagent = s.object({
  id: s.string(),
  runId: text(),
  childThreadId: text(),
  nativeTaskRef: s.optional(s.nullable(s.object({ nativeId: text() }))),
  title: text(),
  prompt: text(),
  status: text(),
  progress: text(),
  result: text(),
  startedAt: text(),
  completedAt: text(),
});
export type RawSubagent = Infer<typeof RawSubagent>;

// T3 sends a turn item bare or wrapped as `{item}`, depending on the list.
const TurnItemEntry = s.union(s.object({ item: RawTurnItem }), RawTurnItem);

export const RawProjection = s.object({
  messages: s.optional(s.array(RawMessage)),
  runs: s.optional(s.array(s.object({ id: s.string(), status: s.optional(s.string()), startedAt: text(), createdAt: text(), completedAt: text() }))),
  runtimeRequests: s.optional(s.array(RawRuntimeRequest)),
  turnItems: s.optional(s.array(TurnItemEntry)),
  visibleTurnItems: s.optional(s.array(TurnItemEntry)),
  subagents: s.optional(s.array(RawSubagent)),
  thread: s.optional(RawThread),
});
export type RawProjection = Infer<typeof RawProjection>;

export const ProjectionResponse = s.object({ projection: s.optional(RawProjection) });

export const RawOptionDescriptor = s.object({
  id: s.string(),
  label: s.optional(s.string()),
  type: s.optional(s.string()),
  options: s.optional(s.array(s.object({ id: s.string(), label: s.optional(s.string()), isDefault: s.optional(s.boolean()) }))),
  currentValue: s.optional(s.unknown()),
  promptInjectedValues: s.optional(s.array(s.string())),
});
export type RawOptionDescriptor = Infer<typeof RawOptionDescriptor>;

export const RawProvider = s.object({
  instanceId: s.string(),
  displayName: text(),
  enabled: s.optional(s.boolean()),
  status: s.optional(s.string()),
  supportedRuntimeModes: s.optional(s.array(s.string())),
  models: s.optional(
    s.array(s.object({ slug: s.string(), name: text(), capabilities: s.optional(s.nullable(s.object({ optionDescriptors: s.optional(s.array(RawOptionDescriptor)) }))) })),
  ),
});

export const RawConfig = s.object({
  providers: s.optional(s.array(RawProvider)),
  environment: s.optional(s.object({ serverVersion: text(), orchestrationProtocolVersion: s.optional(s.nullable(s.number())) })),
});
export type RawConfig = Infer<typeof RawConfig>;

// userdata/server-runtime.json: each field is read on its own, so one bad field does not hide the other.
export const RuntimeOrigin = s.object({ origin: s.string() });
export const RuntimeVersion = s.object({ serverVersion: s.string() });

export const WebSocketTicket = s.object({ ticket: s.string() });

// What T3 stores: message.dispatch references it by id.
export const AttachmentRef = s.object({ type: s.string(), id: s.string(), name: s.string(), mimeType: s.string(), sizeBytes: s.number() });
export type AttachmentRef = Infer<typeof AttachmentRef>;

export const PersistedAttachments = s.object({ attachments: s.optional(s.array(AttachmentRef)) });

/** What assets.createUrl can sign: a stored attachment, or a local file a thread shows. */
export type AssetResource = { _tag: "attachment"; attachmentId: string } | { _tag: "media-file"; threadId: string; path: string };
export const AssetUrl = s.object({ relativeUrl: s.string() });

export interface ImageUpload {
  type: "image";
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export type Command = Record<string, unknown>;

export interface T3Port {
  threadProjection(threadId: string): Promise<RawProjection>;
  dispatch(command: Command): Promise<unknown>;
  getConfig(): Promise<RawConfig>;
  persistAttachments(threadId: string, messageId: string, images: ImageUpload[]): Promise<AttachmentRef[]>;
  /** Fetches an asset through a short-lived signed URL; the file name ends the URL. */
  fetchAsset(resource: AssetResource): Promise<{ response: Response; fileName: string }>;
  subscribeShell(onItems: (items: ShellItem[]) => void, onEnd: (error?: Error) => void): { cancel(): void };
}

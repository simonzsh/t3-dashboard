import type { RoutineSchedule, WebhookFilter, WebhookSignature } from "./automations.ts";
import type { ModelSelection, ProjectIcon, ProjectIconSpec, RuntimeMode } from "./threads.ts";

// Bodies and results of the thread actions (POST /api/threads…).

export type ApprovalDecision = "accept" | "acceptForSession" | "decline";
export type UserInputAnswers = Record<string, string | string[]>;


/** Where a new thread runs. Absent: the current checkout, as it is. */
export type WorkspaceChoice =
  /** Current checkout. `branch` is checked out first; with `create`, it is made first. */
  | { type: "root"; branch?: string; create?: boolean }
  /** Current checkout mode, with the branch already checked out in another worktree: that worktree is reused. */
  | { type: "existing_worktree"; worktreePath: string; branch?: string }
  /** A new worktree made by T3 from `baseRef`; T3 picks the new branch name. */
  | { type: "worktree"; baseRef: string; startFromOrigin?: boolean };

export interface CreateThreadBody {
  /** Empty: the thread goes to T3's "No project". */
  projectId: string;
  title: string;
  text: string;
  modelSelection: ModelSelection;
  /** Defaults to full access. */
  runtimeMode?: RuntimeMode;
  /** Defaults to the current checkout. */
  workspace?: WorkspaceChoice;
  attachments?: ImageAttachment[];
  uploads?: UploadedAttachment[];
}

interface CreateAutomationBase {
  /** 0 to 120 characters; empty uses the first line of the prompt. */
  title: string;
  /** 1 to 20000 characters once trimmed. */
  prompt: string;
  /** Empty: T3's "No project". */
  projectId: string;
  modelSelection: ModelSelection;
  /** Defaults to full access. */
  runtimeMode?: RuntimeMode;
}

export type CreateAutomationBody = CreateAutomationBase &
  (
    | { kind: "routine"; schedule: RoutineSchedule }
    /** `at` is an ISO time from 1 minute to 366 days ahead. */
    | { kind: "reminder"; at: string }
    | { kind: "webhook"; filters: WebhookFilter[]; signature: (WebhookSignature & { secret: string }) | null }
  );

/** The kind must match the stored one. A bound task keeps its project. */
export type UpdateAutomationBody = CreateAutomationBase &
  (
    | { kind: "routine"; schedule: RoutineSchedule }
    | { kind: "reminder"; at: string }
    /** An absent secret keeps the stored one. */
    | { kind: "webhook"; filters: WebhookFilter[]; signature: (WebhookSignature & { secret?: string }) | null }
  );

export interface CreateAutomationResult {
  ok: true;
  id: string;
  /** Public URL with its token; null when T3 Connect is off. */
  webhookUrl: string | null;
  nextRunAt: string | null;
}

export interface ImageAttachment {
  name: string;
  mimeType: string;
  /** `data:<mimeType>;base64,…` */
  dataUrl: string;
}

/** A file already in T3 (POST /api/attachments): message.dispatch sends this ref as is. */
export interface UploadedAttachment {
  type: "image" | "file";
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/** POST /api/attachments: one file per request. */
export interface UploadBody {
  name: string;
  /** file.type, or "application/octet-stream" when empty. */
  mimeType: string;
  /** `data:<mimeType>;base64,…` */
  dataUrl: string;
}

export interface UploadResult {
  ok: true;
  attachment: UploadedAttachment;
}

export interface FileEntry {
  /** Relative to the thread's worktree, or else to the project root. */
  path: string;
  kind: "file" | "directory";
}

export interface FileSearchResult {
  entries: FileEntry[];
  truncated: boolean;
}

/** A command of the thread's provider: typed as `/name` at the start of a message. */
export interface SlashCommand {
  name: string;
  description: string | null;
  /** What goes after the name, e.g. "Objective, or pause, resume, clear". */
  hint?: string;
}

/** A skill of the thread's provider: typed as `$name` in a message. */
export interface SkillInfo {
  name: string;
  displayName: string | null;
  description: string | null;
}

/** GET /api/threads/:id/commands?provider= */
export interface ComposerCommands {
  commands: SlashCommand[];
  skills: SkillInfo[];
}

export interface SendMessageBody {
  text: string;
  mode?: "queue" | "steer";
  attachments?: ImageAttachment[];
  uploads?: UploadedAttachment[];
}

export interface EditQueuedBody {
  text: string;
}

/** POST /api/threads/:id/rewind: back to before this user message. */
export interface RewindBody {
  messageId: string;
  /** Also undo the agent's file edits. */
  restoreFiles: boolean;
}

export interface ThreadSettingsBody {
  modelSelection?: ModelSelection;
  runtimeMode?: RuntimeMode;
}

export type RespondBody = { decision: ApprovalDecision } | { answers: UserInputAnswers };

/** POST /api/threads/:id/secrets/:itemId. The secret is 1 to 8192 characters. */
export type SecretAnswerBody = { secret: string } | { decline: true };

export interface OkResult {
  ok: true;
}

export interface CreateThreadResult {
  ok: true;
  threadId: string;
}

/** POST /api/projects */
export interface CreateProjectBody {
  /** The folder, absolute ("/…") or under the home folder ("~" or "~/…"); missing folders are created. */
  path: string;
  /** Empty or absent: the folder's name. */
  title?: string;
}

export interface CreateProjectResult {
  ok: true;
  projectId: string;
  /** False when an active project already had this folder: nothing was created. */
  created: boolean;
}

export interface FolderEntry {
  name: string;
  /** Absolute path, no trailing slash. */
  path: string;
}

/** GET /api/folders?path=… */
export interface FolderBrowseResult {
  /** The typed path made absolute: "~" expanded, no trailing slash ("/" stays "/"). */
  path: string;
  /** What is at `path`: a folder, nothing yet (it will be created), or something that is not a folder. */
  kind: "directory" | "missing" | "file";
  /** Sub-folders of the typed parent whose name starts with the last typed segment, by name, at most 100.
   *  Hidden folders only when that segment starts with ".". */
  entries: FolderEntry[];
}

/** POST /api/projects/:id/update: only the fields to change, at least one. */
export interface UpdateProjectBody {
  title?: string;
  /** A folder that already exists: "/…", "~" or "~/…". */
  path?: string;
  /** null: back to T3's default icon. */
  icon?: ProjectIconSpec | null;
}

/** GET /api/project-icons: the Lucide icons the edit form offers, in T3's order. */
export interface ProjectIconChoices {
  icons: Array<{ name: string; icon: ProjectIcon }>;
}

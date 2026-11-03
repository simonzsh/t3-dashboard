import type { ModelSelection, RuntimeMode } from "./threads.ts";

// Bodies and results of the thread actions (POST /api/threads…).

export type ApprovalDecision = "accept" | "acceptForSession" | "decline";
export type UserInputAnswers = Record<string, string | string[]>;

export interface CreateThreadBody {
  /** Empty: the thread goes to T3's "No project". */
  projectId: string;
  title: string;
  text: string;
  modelSelection: ModelSelection;
  /** Defaults to full access. */
  runtimeMode?: RuntimeMode;
  attachments?: ImageAttachment[];
  uploads?: UploadedAttachment[];
}

export interface AutomationRequestBody {
  /** 1 to 2000 characters once trimmed. */
  text: string;
  /** Empty: T3's "No project". */
  projectId: string;
  modelSelection: ModelSelection;
  runtimeMode?: RuntimeMode;
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

export interface SendMessageBody {
  text: string;
  mode?: "queue" | "steer";
  attachments?: ImageAttachment[];
  uploads?: UploadedAttachment[];
}

export interface EditQueuedBody {
  text: string;
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

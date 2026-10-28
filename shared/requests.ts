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

export interface SendMessageBody {
  text: string;
  mode?: "queue" | "steer";
  attachments?: ImageAttachment[];
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

import type { ApprovalDecision, AssignIssueBody, AutomationRequestBody, CreateThreadBody, ModelSelection, RespondBody, RewindBody, SendMessageBody, ThreadSettingsBody, UploadedAttachment, UserInputAnswers } from "../../shared/api.ts";
import { normalizeDesk, type DeskUpdate } from "../../shared/desk.ts";
import { IMAGE_TYPES, MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_IMAGES, isRuntimeMode } from "../../shared/limits.ts";
import { STASH_TEXT_MAX, type StashBody } from "../../shared/stash.ts";
import type { FileUpload, ImageUpload } from "../domain/actions.ts";
import { HttpError } from "./httpError.ts";

// Request bodies are untrusted: each check returns a typed body or throws a 400.
const MAX_SEARCH_LIMIT = 50;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/;
const MAX_NAME = 255;
const MAX_MIME = 100;
const MAX_ID = 256;
const MAX_SEARCH_QUERY = 256;
const MAX_FILE_SEARCH_LIMIT = 50;
const DEFAULT_FILE_SEARCH_LIMIT = 20;
const DECISIONS = new Set<string>(["accept", "acceptForSession", "decline"]);

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function validSelection(selection: unknown): ModelSelection | null {
  if (!isObject(selection) || !isText(selection.instanceId) || !isText(selection.model)) return null;
  const { instanceId, model, options } = selection;
  const valid = Array.isArray(options)
    ? options.filter((o): o is { id: string; value: string | number | boolean } => isObject(o) && typeof o.id === "string" && ["string", "number", "boolean"].includes(typeof o.value))
    : undefined;
  return { instanceId, model, ...(valid && { options: valid }) };
}

const MAX_AUTOMATION_TEXT = 2000;

export function validAutomationRequest(body: Record<string, unknown>): AutomationRequestBody {
  const modelSelection = validSelection(body.modelSelection);
  const projectId = body.projectId ?? "";
  if (typeof projectId !== "string" || !isText(body.text) || body.text.trim().length > MAX_AUTOMATION_TEXT || !modelSelection) {
    throw new HttpError(400, `text (1 to ${MAX_AUTOMATION_TEXT} characters) and modelSelection (instanceId, model) are required; projectId is a string`);
  }
  if (body.runtimeMode !== undefined && !isRuntimeMode(body.runtimeMode)) throw new HttpError(400, "runtimeMode is not a known mode");
  return { text: body.text.trim(), projectId: projectId.trim(), modelSelection, ...(isRuntimeMode(body.runtimeMode) && { runtimeMode: body.runtimeMode }) };
}

const MAX_RENAME = 120;

export function validRename(body: Record<string, unknown>): string {
  if (!isText(body.title) || body.title.trim().length > MAX_RENAME) throw new HttpError(400, `title (1 to ${MAX_RENAME} characters) is required`);
  return body.title.trim();
}

export function validCreate(body: Record<string, unknown>): CreateThreadBody {
  const modelSelection = validSelection(body.modelSelection);
  const projectId = body.projectId ?? "";
  if (typeof projectId !== "string" || !isText(body.title) || !isText(body.text) || !modelSelection) {
    throw new HttpError(400, "title, text and modelSelection (instanceId, model) are required; projectId is a string");
  }
  if (body.runtimeMode !== undefined && !isRuntimeMode(body.runtimeMode)) throw new HttpError(400, "runtimeMode is not a known mode");
  return { projectId: projectId.trim(), title: body.title.trim(), text: body.text, modelSelection, ...(isRuntimeMode(body.runtimeMode) && { runtimeMode: body.runtimeMode }) };
}

export function validSearch(params: URLSearchParams): { query: string; limit: number } {
  const query = (params.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 200) throw new HttpError(400, "q must be 2 to 200 characters");
  const raw = params.get("limit");
  const limit = raw === null ? MAX_SEARCH_LIMIT : Number(raw);
  if (raw === "" || !Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) throw new HttpError(400, `limit must be an integer from 1 to ${MAX_SEARCH_LIMIT}`);
  return { query, limit };
}

export function validSettings(body: Record<string, unknown>): ThreadSettingsBody {
  const modelSelection = "modelSelection" in body ? validSelection(body.modelSelection) : undefined;
  const runtimeMode = body.runtimeMode;
  const bad = modelSelection === null || (runtimeMode !== undefined && !isRuntimeMode(runtimeMode)) || (modelSelection === undefined && runtimeMode === undefined);
  if (bad) throw new HttpError(400, "Send modelSelection (instanceId, model) or a known runtimeMode");
  return { ...(modelSelection && { modelSelection }), ...(isRuntimeMode(runtimeMode) && { runtimeMode }) };
}

// The size comes from the data itself: a client could lie about it.
export function decodeDataUrl(mimeType: string, dataUrl: unknown): { base64: string; sizeBytes: number } | null {
  const prefix = `data:${mimeType};base64,`;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) return null;
  const base64 = dataUrl.slice(prefix.length);
  if (base64.length % 4 !== 0 || !BASE64.test(base64)) return null;
  return { base64, sizeBytes: Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0) };
}

function validImages(value: unknown): ImageUpload[] {
  if (value === undefined) return [];
  const error = new HttpError(400, `attachments must be up to ${MAX_IMAGES} PNG, JPEG, GIF or WebP images of 10 MB or less`);
  if (!Array.isArray(value) || value.length > MAX_IMAGES) throw error;
  return value.map((entry) => {
    const name = isObject(entry) && typeof entry.name === "string" ? entry.name.trim() : "";
    if (!isObject(entry) || name === "" || name.length > MAX_NAME || typeof entry.mimeType !== "string" || !IMAGE_TYPES.includes(entry.mimeType)) throw error;
    const decoded = decodeDataUrl(entry.mimeType, entry.dataUrl);
    if (!decoded || decoded.sizeBytes === 0 || decoded.sizeBytes > MAX_IMAGE_BYTES) throw error;
    return { type: "image", name, mimeType: entry.mimeType, sizeBytes: decoded.sizeBytes, dataUrl: entry.dataUrl as string };
  });
}

/** One file of POST /api/attachments: an image type goes as "image" (10 MB), anything else as "file" (50 MB). */
export function validUpload(body: Record<string, unknown>): FileUpload {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mimeType = body.mimeType;
  if (name === "" || name.length > MAX_NAME) throw new HttpError(400, `name must be 1 to ${MAX_NAME} characters`);
  if (typeof mimeType !== "string" || mimeType.length > MAX_MIME || !MIME_TYPE.test(mimeType)) throw new HttpError(400, "mimeType must look like type/subtype");
  const decoded = decodeDataUrl(mimeType, body.dataUrl);
  if (!decoded) throw new HttpError(400, `dataUrl must be data:${mimeType};base64, followed by valid base64`);
  const type = IMAGE_TYPES.includes(mimeType) ? "image" : "file";
  const max = type === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (decoded.sizeBytes === 0 || decoded.sizeBytes > max) throw new HttpError(400, `${type === "image" ? "An image" : "A file"} must be 1 byte to ${max / (1024 * 1024)} MB`);
  return { type, name, mimeType, sizeBytes: decoded.sizeBytes, bytes: Buffer.from(decoded.base64, "base64") };
}

const hasControl = (value: string) => /[\0-\x1f\x7f]/.test(value);

/** Refs of files already in T3: the id came from POST /api/attachments. */
export function validUploads(value: unknown): UploadedAttachment[] {
  if (value === undefined) return [];
  const error = new HttpError(400, `uploads must be up to ${MAX_ATTACHMENTS} files, each with type, id, name, mimeType and sizeBytes`);
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw error;
  return value.map((entry) => {
    if (!isObject(entry) || (entry.type !== "image" && entry.type !== "file")) throw error;
    const { id, name, mimeType, sizeBytes } = entry;
    const valid =
      typeof id === "string" && id.length >= 1 && id.length <= MAX_ID && !id.includes("/") && !hasControl(id) &&
      typeof name === "string" && name.length >= 1 && name.length <= MAX_NAME &&
      typeof mimeType === "string" && mimeType.length <= MAX_MIME &&
      typeof sizeBytes === "number" && Number.isInteger(sizeBytes) && sizeBytes >= 1;
    if (!valid) throw error;
    return { type: entry.type, id, name, mimeType, sizeBytes };
  });
}

/** Images and uploads together share the attachment limit of one message. */
export function validAttachments(body: Record<string, unknown>): { images: ImageUpload[]; uploads: UploadedAttachment[] } {
  const images = validImages(body.attachments);
  const uploads = validUploads(body.uploads);
  if (images.length + uploads.length > MAX_ATTACHMENTS) throw new HttpError(400, `A message takes up to ${MAX_ATTACHMENTS} attachments`);
  return { images, uploads };
}

export function validFileSearch(params: URLSearchParams): { query: string; limit: number } {
  const query = params.get("q") ?? "";
  if (query.length > MAX_SEARCH_QUERY) throw new HttpError(400, `q must be at most ${MAX_SEARCH_QUERY} characters`);
  const raw = params.get("limit");
  const limit = raw === null ? DEFAULT_FILE_SEARCH_LIMIT : Number(raw);
  if (raw === "" || !Number.isInteger(limit) || limit < 1 || limit > MAX_FILE_SEARCH_LIMIT) throw new HttpError(400, `limit must be an integer from 1 to ${MAX_FILE_SEARCH_LIMIT}`);
  return { query, limit };
}

export function validProvider(params: URLSearchParams): string {
  const instanceId = params.get("provider") ?? "";
  if (instanceId === "" || instanceId.length > 200) throw new HttpError(400, "provider must be a provider instance id of 1 to 200 characters");
  return instanceId;
}

export function validItemId(itemId: string): string {
  if (itemId.length > 512) throw new HttpError(400, "itemId must be at most 512 characters");
  return itemId;
}

export function validAssign(body: Record<string, unknown>): Omit<AssignIssueBody, "attachments" | "uploads"> {
  const modelSelection = validSelection(body.modelSelection);
  const projectId = body.projectId ?? "";
  const text = body.text ?? "";
  if (!isText(body.issueId) || typeof projectId !== "string" || typeof text !== "string" || !modelSelection) {
    throw new HttpError(400, "issueId and modelSelection (instanceId, model) are required; projectId and text are strings");
  }
  if (body.runtimeMode !== undefined && !isRuntimeMode(body.runtimeMode)) throw new HttpError(400, "runtimeMode is not a known mode");
  return { issueId: body.issueId, projectId: projectId.trim(), text, modelSelection, ...(isRuntimeMode(body.runtimeMode) && { runtimeMode: body.runtimeMode }) };
}

export function validRespond(body: Record<string, unknown>): RespondBody {
  const hasDecision = "decision" in body;
  const hasAnswers = "answers" in body;
  if (hasDecision === hasAnswers) throw new HttpError(400, "Send either decision or answers");
  if (hasDecision) {
    if (typeof body.decision !== "string" || !DECISIONS.has(body.decision)) throw new HttpError(400, "decision must be accept, acceptForSession or decline");
    return { decision: body.decision as ApprovalDecision };
  }
  const answers = body.answers;
  const valid = isObject(answers) && Object.values(answers).every((value) => typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string")));
  if (!valid) throw new HttpError(400, "answers must map question ids to strings or string arrays");
  return { answers: answers as UserInputAnswers };
}

export function validQueuedEdit(body: Record<string, unknown>): string {
  if (typeof body.text !== "string" || body.text.trim() === "") throw new HttpError(400, "text is required");
  return body.text;
}

export function validRewind(body: Record<string, unknown>): RewindBody {
  if (typeof body.messageId !== "string" || body.messageId === "" || body.messageId.length > 512) throw new HttpError(400, "messageId is required");
  if (typeof body.restoreFiles !== "boolean") throw new HttpError(400, "restoreFiles must be true or false");
  return { messageId: body.messageId, restoreFiles: body.restoreFiles };
}

export function validMessage(body: Record<string, unknown>): { message: Omit<SendMessageBody, "attachments" | "uploads">; images: ImageUpload[]; uploads: UploadedAttachment[] } {
  if (typeof body.text !== "string") throw new HttpError(400, "text is required");
  if (body.mode !== undefined && body.mode !== "queue" && body.mode !== "steer") throw new HttpError(400, "mode must be queue or steer");
  const { images, uploads } = validAttachments(body);
  if (body.text.trim() === "" && images.length + uploads.length === 0) throw new HttpError(400, "text or an attachment is required");
  return { message: { text: body.text, ...(body.mode && { mode: body.mode }) }, images, uploads };
}

const MAX_ORIGIN = 100;

export function validDesk(body: Record<string, unknown>): DeskUpdate {
  const desk = normalizeDesk(body.desk);
  if (!desk || !isText(body.origin) || body.origin.length > MAX_ORIGIN) {
    throw new HttpError(400, `desk (an ids list) and origin (1 to ${MAX_ORIGIN} characters) are required`);
  }
  return { desk, origin: body.origin };
}

const MAX_THREAD_TITLE = 500;

/** A draft to stash: text, uploads or both, and the conversation it came from. */
export function validStash(body: Record<string, unknown>): StashBody {
  const uploads = validUploads(body.uploads);
  const { text, threadId, threadTitle } = body;
  if (typeof text !== "string" || text.length > STASH_TEXT_MAX || (text.trim() === "" && uploads.length === 0)) {
    throw new HttpError(400, `text (up to ${STASH_TEXT_MAX} characters) or uploads is required`);
  }
  if (!isText(threadId) || threadId.length > MAX_ID || typeof threadTitle !== "string" || threadTitle.length > MAX_THREAD_TITLE) {
    throw new HttpError(400, `threadId and threadTitle (up to ${MAX_THREAD_TITLE} characters) are required`);
  }
  return { text, uploads, threadId, threadTitle };
}

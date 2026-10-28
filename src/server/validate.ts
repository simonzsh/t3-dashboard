import type { ApprovalDecision, AssignIssueBody, AutomationRequestBody, CreateThreadBody, ModelSelection, RespondBody, SendMessageBody, ThreadSettingsBody, UserInputAnswers } from "../../shared/api.ts";
import { normalizeDesk, type DeskUpdate } from "../../shared/desk.ts";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES, isRuntimeMode } from "../../shared/limits.ts";
import type { ImageUpload } from "../domain/actions.ts";
import { HttpError } from "./httpError.ts";

// Request bodies are untrusted: each check returns a typed body or throws a 400.
const MAX_SEARCH_LIMIT = 50;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
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
export function validImages(value: unknown): ImageUpload[] {
  if (value === undefined) return [];
  const error = new HttpError(400, `attachments must be up to ${MAX_IMAGES} PNG, JPEG, GIF or WebP images of 10 MB or less`);
  if (!Array.isArray(value) || value.length > MAX_IMAGES) throw error;
  return value.map((entry) => {
    const name = isObject(entry) && typeof entry.name === "string" ? entry.name.trim() : "";
    if (!isObject(entry) || name === "" || name.length > 255 || typeof entry.mimeType !== "string" || !IMAGE_TYPES.includes(entry.mimeType)) throw error;
    const prefix = `data:${entry.mimeType};base64,`;
    if (typeof entry.dataUrl !== "string" || !entry.dataUrl.startsWith(prefix)) throw error;
    const data = entry.dataUrl.slice(prefix.length);
    if (data.length % 4 !== 0 || !BASE64.test(data)) throw error;
    const sizeBytes = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
    if (sizeBytes === 0 || sizeBytes > MAX_IMAGE_BYTES) throw error;
    return { type: "image", name, mimeType: entry.mimeType, sizeBytes, dataUrl: entry.dataUrl };
  });
}

export function validAssign(body: Record<string, unknown>): Omit<AssignIssueBody, "attachments"> {
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

export function validMessage(body: Record<string, unknown>): { message: Omit<SendMessageBody, "attachments">; images: ImageUpload[] } {
  if (typeof body.text !== "string") throw new HttpError(400, "text is required");
  if (body.mode !== undefined && body.mode !== "queue" && body.mode !== "steer") throw new HttpError(400, "mode must be queue or steer");
  const images = validImages(body.attachments);
  if (body.text.trim() === "" && images.length === 0) throw new HttpError(400, "text or an image is required");
  return { message: { text: body.text, ...(body.mode && { mode: body.mode }) }, images };
}

const MAX_ORIGIN = 100;

export function validDesk(body: Record<string, unknown>): DeskUpdate {
  const desk = normalizeDesk(body.desk);
  if (!desk || !isText(body.origin) || body.origin.length > MAX_ORIGIN) {
    throw new HttpError(400, `desk (windows and history lists) and origin (1 to ${MAX_ORIGIN} characters) are required`);
  }
  return { desk, origin: body.origin };
}

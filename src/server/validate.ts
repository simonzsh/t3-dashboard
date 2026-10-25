import type { ApprovalDecision, AssignIssueBody, CreateThreadBody, ModelSelection, RespondBody, SendMessageBody, ThreadSettingsBody, UserInputAnswers } from "../../shared/api.ts";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES, isRuntimeMode } from "../../shared/limits.ts";
import type { ImageUpload } from "../domain/actions.ts";
import { HttpError } from "./httpError.ts";

// Request bodies are untrusted: each check returns a typed body or throws a 400.
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

export function validCreate(body: Record<string, unknown>): CreateThreadBody {
  const modelSelection = validSelection(body.modelSelection);
  const projectId = body.projectId ?? "";
  if (typeof projectId !== "string" || !isText(body.title) || !isText(body.text) || !modelSelection) {
    throw new HttpError(400, "title, text and modelSelection (instanceId, model) are required; projectId is a string");
  }
  if (body.runtimeMode !== undefined && !isRuntimeMode(body.runtimeMode)) throw new HttpError(400, "runtimeMode is not a known mode");
  return { projectId: projectId.trim(), title: body.title.trim(), text: body.text, modelSelection, ...(isRuntimeMode(body.runtimeMode) && { runtimeMode: body.runtimeMode }) };
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

export function validAssign(body: Record<string, unknown>): AssignIssueBody {
  if (!isText(body.issueId) || !isText(body.projectId) || (body.agent !== "claude" && body.agent !== "codex")) {
    throw new HttpError(400, "issueId, projectId and agent (claude or codex) are required");
  }
  return { issueId: body.issueId, agent: body.agent, projectId: body.projectId };
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

export function validMessage(body: Record<string, unknown>): { message: Omit<SendMessageBody, "attachments">; images: ImageUpload[] } {
  if (typeof body.text !== "string") throw new HttpError(400, "text is required");
  if (body.mode !== undefined && body.mode !== "queue" && body.mode !== "steer") throw new HttpError(400, "mode must be queue or steer");
  const images = validImages(body.attachments);
  if (body.text.trim() === "" && images.length === 0) throw new HttpError(400, "text or an image is required");
  return { message: { text: body.text, ...(body.mode && { mode: body.mode }) }, images };
}

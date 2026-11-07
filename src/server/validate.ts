import type { ApprovalDecision, AssignIssueBody, CreateAutomationBody, CreateProjectBody, CreateThreadBody, ProjectIconSpec, RoutineSchedule, WebhookFilter, WebhookSignature, ModelSelection, RespondBody, RewindBody, SaveNewsBody, SecretAnswerBody, SendMessageBody, ThreadSettingsBody, UpdateAutomationBody, UpdateProjectBody, UploadedAttachment, UserInputAnswers } from "../../shared/api.ts";
import { PROJECT_COLOR_NAMES } from "../../shared/projectColors.ts";
import { ACTIVITY_PERIODS, DEFAULT_ACTIVITY_PERIOD, type ActivityPeriod } from "../../shared/usage.ts";
import { isObject } from "../../shared/guards.ts";
import { isTimeOfDay } from "../config/newsFile.ts";
import { normalizeSessions, type SessionsUpdate } from "../../shared/sessions.ts";
import { IMAGE_TYPES, MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_SECRET_CHARS, isRuntimeMode } from "../../shared/limits.ts";
import { isSeenId, isSeenTime, type SeenChange } from "../../shared/seen.ts";
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

export const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function validSelection(selection: unknown): ModelSelection | null {
  if (!isObject(selection) || !isText(selection.instanceId) || !isText(selection.model)) return null;
  const { instanceId, model, options } = selection;
  const valid = Array.isArray(options)
    ? options.filter((o): o is { id: string; value: string | number | boolean } => isObject(o) && typeof o.id === "string" && ["string", "number", "boolean"].includes(typeof o.value))
    : undefined;
  return { instanceId, model, ...(valid && { options: valid }) };
}

const MAX_AUTOMATION_TITLE = 120;
const MAX_AUTOMATION_PROMPT = 20_000;
const MAX_FILTERS = 16;
const MAX_MINUTES = 525_600;
const FILTER_PATH = /^(body|headers|query)(\.|$)/;
const TIME_OF_DAY = /^([01]?\d|2[0-3]):[0-5]\d$/;
const HEADER_NAME = /^[\w-]{1,100}$/;
const bad = (message: string) => new HttpError(400, message);

function validFilter(entry: unknown): WebhookFilter {
  if (!isObject(entry) || typeof entry.path !== "string" || !FILTER_PATH.test(entry.path.trim())) throw bad("Each filter needs a path that starts with body, headers or query");
  const path = entry.path.trim();
  const { op, value } = entry;
  if (op === "exists") return { path, op };
  if (op === "equals" || op === "notEquals" || op === "startsWith") {
    if (!isText(value)) throw bad("A filter value is required");
    return { path, op, value: value.trim() };
  }
  if (op === "in") {
    const items = Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : "")) : [];
    if (items.length === 0 || items.some((item) => item === "" || item.includes(","))) throw bad("An in filter needs one or more values without commas");
    return { path, op, value: items };
  }
  throw bad("A filter operator is not known");
}

function validSignature(value: unknown, secretOptional: boolean): (WebhookSignature & { secret?: string }) | null {
  if (value === null) return null;
  if (!isObject(value) || typeof value.header !== "string" || !HEADER_NAME.test(value.header.trim()) || (value.encoding !== "hex" && value.encoding !== "base64") || typeof value.prefix !== "string" || value.prefix.length > 50) {
    throw bad("signature needs a header, an encoding (hex or base64) and a prefix");
  }
  const header = value.header.trim().toLowerCase();
  if (secretOptional && value.secret === undefined) return { header, encoding: value.encoding, prefix: value.prefix };
  if (!isText(value.secret) || value.secret.length > MAX_SECRET_CHARS) throw bad(`The signing secret must be 1 to ${MAX_SECRET_CHARS} characters`);
  // T3 trims the stored secret, so GitHub signatures would never match.
  if (value.secret !== value.secret.trim()) throw bad("The signing secret must not start or end with a space");
  return { header, encoding: value.encoding, prefix: value.prefix, secret: value.secret };
}

function validRoutine(value: unknown): RoutineSchedule {
  if (isObject(value) && value.type === "interval") {
    const minutes = value.everyMinutes;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) throw bad(`everyMinutes must be a whole number from 1 to ${MAX_MINUTES}`);
    return { type: "interval", everyMinutes: minutes };
  }
  if (isObject(value) && value.type === "fixed_time") {
    const { timeOfDay, weekdays } = value;
    if (typeof timeOfDay !== "string" || !TIME_OF_DAY.test(timeOfDay)) throw bad("timeOfDay must look like 09:30");
    if (!Array.isArray(weekdays) || weekdays.some((day) => !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6)) throw bad("weekdays must list days from 0 (Sunday) to 6");
    return { type: "fixed_time", timeOfDay, weekdays: weekdays as number[] };
  }
  throw bad("schedule must be an interval or a fixed_time");
}

// Messages name the field and never repeat a value: the body can hold a signing secret.
function validAutomation(body: Record<string, unknown>, secretOptional: boolean) {
  const modelSelection = validSelection(body.modelSelection);
  const projectId = body.projectId ?? "";
  const title = body.title ?? "";
  if (typeof projectId !== "string" || typeof title !== "string" || title.trim().length > MAX_AUTOMATION_TITLE || !isText(body.prompt) || body.prompt.trim().length > MAX_AUTOMATION_PROMPT || !modelSelection) {
    throw bad(`prompt (1 to ${MAX_AUTOMATION_PROMPT} characters), title (up to ${MAX_AUTOMATION_TITLE}) and modelSelection (instanceId, model) are required; projectId is a string`);
  }
  if (body.runtimeMode !== undefined && !isRuntimeMode(body.runtimeMode)) throw bad("runtimeMode is not a known mode");
  const common = { title: title.trim(), prompt: body.prompt.trim(), projectId: projectId.trim(), modelSelection, ...(isRuntimeMode(body.runtimeMode) && { runtimeMode: body.runtimeMode }) };
  if (body.kind === "routine") return { ...common, kind: "routine" as const, schedule: validRoutine(body.schedule) };
  if (body.kind === "reminder") {
    if (typeof body.at !== "string" || Number.isNaN(Date.parse(body.at))) throw bad("at must be an ISO date and time");
    return { ...common, kind: "reminder" as const, at: body.at };
  }
  if (body.kind === "webhook") {
    if (!Array.isArray(body.filters) || body.filters.length > MAX_FILTERS) throw bad(`filters must be a list of at most ${MAX_FILTERS}`);
    return { ...common, kind: "webhook" as const, filters: body.filters.map(validFilter), signature: validSignature(body.signature ?? null, secretOptional) };
  }
  throw bad("kind must be routine, reminder or webhook");
}

export const validCreateAutomation = (body: Record<string, unknown>) => validAutomation(body, false) as CreateAutomationBody;

/** Like a creation, except that a signed webhook may omit the secret: T3 keeps the stored one. */
export const validUpdateAutomation = (body: Record<string, unknown>) => validAutomation(body, true) as UpdateAutomationBody;

export function validCreate(body: Record<string, unknown>): CreateThreadBody {
  const modelSelection = validSelection(body.modelSelection);
  const projectId = body.projectId ?? "";
  if (typeof projectId !== "string" || !isText(body.title) || !isText(body.text) || !modelSelection) {
    throw new HttpError(400, "title, text and modelSelection (instanceId, model) are required; projectId is a string");
  }
  if (body.runtimeMode !== undefined && !isRuntimeMode(body.runtimeMode)) throw new HttpError(400, "runtimeMode is not a known mode");
  return { projectId: projectId.trim(), title: body.title.trim(), text: body.text, modelSelection, ...(isRuntimeMode(body.runtimeMode) && { runtimeMode: body.runtimeMode }) };
}

const FOLDER_PATH = /^(\/|~$|~\/)/;
const FOLDER_PATH_MAX = 512;
const PROJECT_TITLE_MAX = 200;

const validPath = (value: unknown): string => {
  const path = typeof value === "string" ? value.trim() : "";
  if (path.length === 0 || path.length > FOLDER_PATH_MAX || !FOLDER_PATH.test(path) || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new HttpError(400, `path must be an absolute folder path (/… or ~/…), up to ${FOLDER_PATH_MAX} characters`);
  }
  return path;
};

export const validFolderPath = (params: URLSearchParams): string => validPath(params.get("path"));

export function validCreateProject(body: Record<string, unknown>): CreateProjectBody {
  const path = validPath(body.path);
  if (body.title === undefined) return { path };
  if (typeof body.title !== "string" || body.title.trim().length > PROJECT_TITLE_MAX) throw new HttpError(400, `title must be a string of at most ${PROJECT_TITLE_MAX} characters`);
  const title = body.title.trim();
  return title ? { path, title } : { path };
}

const validTitle = (value: unknown): string => {
  const title = typeof value === "string" ? value.trim() : "";
  if (title.length === 0 || title.length > PROJECT_TITLE_MAX) throw new HttpError(400, `title must be 1 to ${PROJECT_TITLE_MAX} characters`);
  return title;
};

const LUCIDE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MONOGRAM = /^[\p{L}\p{N}]+$/u;

function validIcon(value: unknown): ProjectIconSpec {
  const bad = new HttpError(400, "icon is not a valid project icon");
  if (typeof value !== "object" || value === null) throw bad;
  const icon = value as Record<string, unknown>;
  const color = typeof icon.color === "string" && (PROJECT_COLOR_NAMES as readonly string[]).includes(icon.color) ? icon.color : undefined;
  if (icon.kind === "lucide" && color && typeof icon.name === "string" && icon.name.length <= 64 && LUCIDE_NAME.test(icon.name)) return { kind: "lucide", name: icon.name, color };
  if (icon.kind === "monogram" && color && typeof icon.text === "string") {
    const text = icon.text.trim();
    // Count after uppercasing: "ß" becomes "SS", and T3 refuses more than 2 characters.
    const upper = text.toUpperCase();
    if (MONOGRAM.test(upper) && Array.from(upper).length <= 2) return { kind: "monogram", text: upper, color };
  }
  if (icon.kind === "emoji" && typeof icon.emoji === "string") {
    const emoji = icon.emoji.trim();
    if (emoji.length >= 1 && emoji.length <= 32) return { kind: "emoji", emoji };
  }
  throw bad;
}

export function validUpdateProject(body: Record<string, unknown>): UpdateProjectBody {
  if (body.title === undefined && body.path === undefined && body.icon === undefined) throw new HttpError(400, "give a title, a path or an icon");
  return {
    ...(body.title !== undefined && { title: validTitle(body.title) }),
    ...(body.path !== undefined && { path: validPath(body.path) }),
    ...(body.icon !== undefined && { icon: body.icon === null ? null : validIcon(body.icon) }),
  };
}

export function validSearch(params: URLSearchParams): { query: string; limit: number } {
  const query = (params.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 200) throw new HttpError(400, "q must be 2 to 200 characters");
  const raw = params.get("limit");
  const limit = raw === null ? MAX_SEARCH_LIMIT : Number(raw);
  if (raw === "" || !Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) throw new HttpError(400, `limit must be an integer from 1 to ${MAX_SEARCH_LIMIT}`);
  return { query, limit };
}

/** The IANA zone of `?tz=`, or undefined when absent (the server zone then applies). */
export function validTimeZone(value: string | null): string {
  if (value === null) throw new HttpError(400, "tz is required: an IANA time zone, such as Europe/Paris");
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
  } catch {
    throw new HttpError(400, "tz must be an IANA time zone, such as Europe/Paris");
  }
  return value;
}

/** The Activity period of `?period=`: 7 when absent, so older bundles keep working. */
export function validActivityPeriod(value: string | null): ActivityPeriod {
  if (value === null) return DEFAULT_ACTIVITY_PERIOD;
  const period = ACTIVITY_PERIODS.find((days) => String(days) === value);
  if (period === undefined) throw new HttpError(400, "period must be 7, 30 or 90");
  return period;
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

// Errors name the rule, never the value.
export function validSecretAnswer(body: Record<string, unknown>): SecretAnswerBody {
  const hasSecret = "secret" in body;
  if (hasSecret === ("decline" in body)) throw new HttpError(400, "Send either secret or decline");
  if (!hasSecret) {
    if (body.decline !== true) throw new HttpError(400, "decline must be true");
    return { decline: true };
  }
  if (typeof body.secret !== "string" || body.secret.trim() === "" || body.secret.length > MAX_SECRET_CHARS) throw new HttpError(400, `secret must be 1 to ${MAX_SECRET_CHARS} characters`);
  return { secret: body.secret };
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

export function validSessions(body: Record<string, unknown>): SessionsUpdate {
  const sessions = normalizeSessions(body.sessions);
  if (!sessions || !isText(body.origin) || body.origin.length > MAX_ORIGIN) {
    throw new HttpError(400, `sessions (an ids list) and origin (1 to ${MAX_ORIGIN} characters) are required`);
  }
  return { sessions, origin: body.origin };
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

export function validSeen(body: Record<string, unknown>): SeenChange {
  if (isSeenId(body.id) && isSeenTime(body.at)) return { id: body.id, at: body.at };
  if (isSeenTime(body.since)) return { since: body.since };
  throw new HttpError(400, "id and at (a mark), or since (the baseline), are required");
}

export function validEnabled(body: Record<string, unknown>): boolean {
  if (typeof body.enabled !== "boolean") throw new HttpError(400, "enabled (true or false) is required");
  return body.enabled;
}

const NEWS_TOPICS_MAX = 10;
const NEWS_TOPIC_MAX = 60;
const NEWS_LANGUAGE_MAX = 40;
// Control characters would break the task prompt, which the agent reads as text.
const CONTROL = /\p{Cc}/u;

export function validSaveNews(body: Record<string, unknown>): SaveNewsBody {
  const { timeOfDay, topics, language } = body;
  const modelSelection = validSelection(body.modelSelection);
  if (typeof timeOfDay !== "string" || !isTimeOfDay(timeOfDay)) throw bad("timeOfDay must look like 07:00");
  if (!Array.isArray(topics) || topics.some((topic) => typeof topic !== "string")) throw bad("topics must be a list of text");
  const clean = (topics as string[]).map((topic) => topic.trim()).filter((topic, index, all) => topic !== "" && all.findIndex((other) => other.toLowerCase() === topic.toLowerCase()) === index);
  if (clean.length === 0 || clean.length > NEWS_TOPICS_MAX) throw bad(`topics must list 1 to ${NEWS_TOPICS_MAX} topics`);
  if (clean.some((topic) => topic.length > NEWS_TOPIC_MAX || CONTROL.test(topic))) throw bad(`each topic must be text of at most ${NEWS_TOPIC_MAX} characters`);
  const name = typeof language === "string" ? language.trim() : "";
  if (name === "" || name.length > NEWS_LANGUAGE_MAX || CONTROL.test(name)) throw bad(`language must be text of 1 to ${NEWS_LANGUAGE_MAX} characters`);
  if (!modelSelection) throw bad("modelSelection (instanceId, model) is required");
  return { timeOfDay, topics: clean, language: name, modelSelection };
}

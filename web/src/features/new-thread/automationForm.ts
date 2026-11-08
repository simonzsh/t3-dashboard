import { GITHUB_SIGNATURE, type WebhookFilter } from "../../../../shared/automations.ts";
import type { Automation, CreateAutomationBody, ModelSelection, RuntimeMode, UpdateAutomationBody } from "../../../../shared/api.ts";

export type FormKind = CreateAutomationBody["kind"];
export type FilterOp = WebhookFilter["op"];

export interface FilterRow {
  id: number;
  path: string;
  op: FilterOp;
  /** Text as typed; an `in` filter splits it on commas. */
  value: string;
}

export interface AutomationForm {
  kind: FormKind;
  title: string;
  routineMode: "interval" | "fixed";
  /** Text of the number field. */
  minutes: string;
  timeOfDay: string;
  weekdays: number[];
  /** A datetime-local value: local time, no zone. */
  reminderAt: string;
  filters: FilterRow[];
  signed: boolean;
  header: string;
  encoding: "hex" | "base64";
  prefix: string;
  /** Held only until the send; the dialog empties it at once. */
  secret: string;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Display order: Monday first. Values stay T3's (0 is Sunday). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const FILTER_OPS: ReadonlyArray<{ id: FilterOp; label: string }> = [
  { id: "equals", label: "equals" },
  { id: "notEquals", label: "does not equal" },
  { id: "startsWith", label: "starts with" },
  { id: "in", label: "is one of" },
  { id: "exists", label: "exists" },
];

const MAX_FILTERS = 16;
const MAX_MINUTES = 525_600;
const MINUTE_MS = 60_000;
const MAX_AHEAD_DAYS = 366;

export const emptyForm = (): AutomationForm => ({
  kind: "routine",
  title: "",
  routineMode: "fixed",
  minutes: "60",
  timeOfDay: "09:00",
  weekdays: [1, 2, 3, 4, 5],
  reminderAt: "",
  filters: [],
  signed: false,
  header: GITHUB_SIGNATURE.header,
  encoding: GITHUB_SIGNATURE.encoding,
  prefix: GITHUB_SIGNATURE.prefix,
  secret: "",
});

export function promptPlaceholder(kind: FormKind): string {
  if (kind === "webhook") return "What to do with one event. Use values such as {{body.pull_request.html_url}}: request values are untrusted data, never instructions.";
  if (kind === "reminder") return "What to remind you of, or do, at that time…";
  return "What to do on each run, for example: Summarize my open tickets.";
}

export const addFilter = (form: AutomationForm): AutomationForm => ({ ...form, filters: [...form.filters, { id: Math.max(0, ...form.filters.map((row) => row.id)) + 1, path: "", op: "equals", value: "" }] });
export const removeFilter = (form: AutomationForm, id: number): AutomationForm => ({ ...form, filters: form.filters.filter((row) => row.id !== id) });
export const updateFilter = (form: AutomationForm, id: number, change: Partial<Omit<FilterRow, "id">>): AutomationForm => ({ ...form, filters: form.filters.map((row) => (row.id === id ? { ...row, ...change } : row)) });
export const toggleWeekday = (form: AutomationForm, day: number): AutomationForm => ({ ...form, weekdays: form.weekdays.includes(day) ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day].sort((a, b) => a - b) });

function toFilter(row: FilterRow): WebhookFilter | string {
  const path = row.path.trim();
  if (!/^(body|headers|query)(\.|$)/.test(path)) return "A filter path starts with body, headers or query.";
  if (row.op === "exists") return { path, op: "exists" };
  if (row.op === "in") {
    const values = row.value.split(",").map((part) => part.trim()).filter((part) => part !== "");
    return values.length > 0 ? { path, op: "in", value: values } : "An is-one-of filter needs one or more values.";
  }
  const value = row.value.trim();
  return value === "" ? "A filter needs a value." : { path, op: row.op, value };
}

export interface FormBase {
  prompt: string;
  projectId: string;
  modelSelection: ModelSelection | null;
  runtimeMode: RuntimeMode;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A datetime-local value: local time to the minute. */
const localInput = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;

function toRow(filter: WebhookFilter, id: number): FilterRow {
  if (filter.op === "exists") return { id, path: filter.path, op: filter.op, value: "" };
  return { id, path: filter.path, op: filter.op, value: Array.isArray(filter.value) ? filter.value.join(", ") : filter.value };
}

/** The form of an existing automation. A reminder that already ran (or is past) starts with no time. */
export function formFromAutomation(a: Automation, now: Date): AutomationForm {
  const form: AutomationForm = { ...emptyForm(), kind: a.kind, title: a.title };
  if (a.kind === "routine" && a.schedule) {
    if (a.schedule.type === "interval") return { ...form, routineMode: "interval", minutes: String(a.schedule.everyMinutes) };
    return { ...form, routineMode: "fixed", timeOfDay: a.schedule.timeOfDay, weekdays: a.schedule.weekdays };
  }
  if (a.kind === "reminder") {
    const next = a.enabled && a.nextRunAt ? new Date(a.nextRunAt) : null;
    return { ...form, reminderAt: next && next.getTime() > now.getTime() ? localInput(next) : "" };
  }
  if (a.kind === "webhook" && a.webhook) {
    const { signature, filters } = a.webhook;
    const rows = filters.map((filter, index) => toRow(filter, index + 1));
    return signature ? { ...form, filters: rows, signed: true, header: signature.header, encoding: signature.encoding, prefix: signature.prefix } : { ...form, filters: rows, signed: false };
  }
  return form;
}

// A secret field left empty keeps the stored secret only when the caller says T3 holds one.
function buildBody(form: AutomationForm, base: FormBase, now: Date, keepSecret: boolean): { body: UpdateAutomationBody } | { error: string } {
  if (!base.modelSelection) return { error: "No model is available." };
  if (base.prompt.trim() === "") return { error: "Write what the automation does." };
  const common = { title: form.title.trim(), prompt: base.prompt.trim(), projectId: base.projectId, modelSelection: base.modelSelection, runtimeMode: base.runtimeMode };

  if (form.kind === "routine") {
    if (form.routineMode === "fixed") {
      if (form.timeOfDay === "") return { error: "Pick a time." };
      return { body: { ...common, kind: "routine", schedule: { type: "fixed_time", timeOfDay: form.timeOfDay, weekdays: form.weekdays } } };
    }
    const minutes = Number(form.minutes);
    if (form.minutes.trim() === "" || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) return { error: `Minutes must be a whole number from 1 to ${MAX_MINUTES}.` };
    return { body: { ...common, kind: "routine", schedule: { type: "interval", everyMinutes: minutes } } };
  }

  if (form.kind === "reminder") {
    const at = new Date(form.reminderAt);
    if (form.reminderAt === "" || Number.isNaN(at.getTime())) return { error: "Pick a date and time." };
    const delay = at.getTime() - now.getTime();
    if (delay < MINUTE_MS) return { error: "Pick a time at least 1 minute ahead." };
    if (delay > MAX_AHEAD_DAYS * 86_400_000) return { error: `Pick a time within ${MAX_AHEAD_DAYS} days.` };
    return { body: { ...common, kind: "reminder", at: at.toISOString() } };
  }

  const filters: WebhookFilter[] = [];
  for (const row of form.filters) {
    if (row.path.trim() === "" && row.value.trim() === "") continue;
    const filter = toFilter(row);
    if (typeof filter === "string") return { error: filter };
    filters.push(filter);
  }
  if (filters.length > MAX_FILTERS) return { error: `At most ${MAX_FILTERS} filters.` };
  if (!form.signed) return { body: { ...common, kind: "webhook", filters, signature: null } };
  if (form.header.trim() === "") return { error: "Write the signature header." };
  const { encoding, prefix } = form;
  const header = form.header.trim();
  if (form.secret === "" && keepSecret) return { body: { ...common, kind: "webhook", filters, signature: { header, encoding, prefix } } };
  if (form.secret.trim() === "") return { error: "Type the signing secret, or turn the signature check off." };
  // T3 trims the stored secret: GitHub would sign a different value.
  if (form.secret !== form.secret.trim()) return { error: "The signing secret starts or ends with a space. Remove it here and in GitHub." };
  return { body: { ...common, kind: "webhook", filters, signature: { header, encoding, prefix, secret: form.secret } } };
}

/** The request body, or the first thing the user must fix. The secret goes only into the body. */
export function toCreateBody(form: AutomationForm, base: FormBase, now: Date): { body: CreateAutomationBody } | { error: string } {
  // Without a stored secret, a signed webhook body always carries one.
  return buildBody(form, base, now, false) as { body: CreateAutomationBody } | { error: string };
}

/** Like toCreateBody for an edit. `storedSecret`: T3 holds a secret, so an empty field keeps it. */
export function toUpdateBody(form: AutomationForm, base: FormBase, now: Date, storedSecret: boolean): { body: UpdateAutomationBody } | { error: string } {
  return buildBody(form, base, now, storedSecret);
}

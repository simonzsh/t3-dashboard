import { GITHUB_SIGNATURE, type WebhookFilter } from "../../../../shared/automations.ts";
import type { CreateAutomationBody, ModelSelection, RuntimeMode } from "../../../../shared/api.ts";

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
  signed: true,
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

/** The request body, or the first thing the user must fix. The secret goes only into the body. */
export function toCreateBody(form: AutomationForm, base: FormBase, now: Date): { body: CreateAutomationBody } | { error: string } {
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
  if (form.secret.trim() === "") return { error: "Type the signing secret, or turn the signature check off." };
  return { body: { ...common, kind: "webhook", filters, signature: { header: form.header.trim(), encoding: form.encoding, prefix: form.prefix, secret: form.secret } } };
}

import type { RoutineSchedule, WebhookFilter, WebhookSignature } from "../../shared/api.ts";
import type { ScheduleInput } from "../integrations/t3/schemas.ts";
import { DomainError } from "./errors.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MIN_AHEAD_MS = MINUTE_MS;
const MAX_AHEAD_MS = 366 * DAY_MS;
// A fixed_time run falls on the next matching weekday: under a week it cannot land a week late.
const FIXED_TIME_MAX_MS = 7 * DAY_MS;

export function routineSchedule(schedule: RoutineSchedule): ScheduleInput {
  if (schedule.type === "interval") return { type: "interval", everyMs: schedule.everyMinutes * MINUTE_MS };
  const weekdays = [...new Set(schedule.weekdays)].sort((a, b) => a - b);
  return { type: "fixed_time", timeOfDay: schedule.timeOfDay, ...(weekdays.length > 0 && weekdays.length < 7 && { weekdays }) };
}

// T3 reads fixed_time in its own time zone, which is the zone of this host.
export function reminderSchedule(at: Date, now: Date): ScheduleInput {
  const delay = at.getTime() - now.getTime();
  if (!(delay >= MIN_AHEAD_MS && delay <= MAX_AHEAD_MS)) throw new DomainError("invalid", "Pick a time from 1 minute to 366 days ahead");
  if (delay >= FIXED_TIME_MAX_MS) return { type: "interval", everyMs: Math.round(delay) };
  const pad = (value: number) => String(value).padStart(2, "0");
  return { type: "fixed_time", timeOfDay: `${pad(at.getHours())}:${pad(at.getMinutes())}`, weekdays: [at.getDay()] };
}

export function webhookSchedule(filters: WebhookFilter[], signature: (WebhookSignature & { secret: string }) | null): ScheduleInput {
  return { type: "webhook", signature, ...(filters.length > 0 && { filters }) };
}

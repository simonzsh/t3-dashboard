import type { RawScheduledTask } from "../integrations/t3/schemas.ts";

const MIN = 60_000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FALLBACK = "Schedule";

function intervalLabel(everyMs: number | undefined): string {
  if (everyMs === undefined || !(everyMs >= MIN)) return FALLBACK;
  const minutes = Math.round(everyMs / MIN);
  if (minutes % 1440 === 0) return `Every ${minutes / 1440} d`;
  if (minutes % 60 === 0) return `Every ${minutes / 60} h`;
  return `Every ${minutes} min`;
}

function daysLabel(weekdays: readonly number[] | null | undefined): string {
  // Monday first, like the week T3 Code shows.
  const days = [...new Set(weekdays ?? [])].filter((day) => day >= 0 && day <= 6).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (days.length === 0 || days.length === 7) return "Daily";
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "6,0") return "Weekends";
  return days.map((day) => DAY_NAMES[day]).join(", ");
}

/** A short English label for when a scheduled task runs. */
export function scheduleLabel(schedule: RawScheduledTask["schedule"]): string {
  switch (schedule?.type) {
    case "interval":
      return intervalLabel(schedule.everyMs);
    case "webhook":
      return "Webhook";
    case "fixed_time": {
      const time = /^(\d{1,2}):(\d{2})$/.exec(schedule.timeOfDay ?? "");
      return time ? `${daysLabel(schedule.weekdays)} ${Number(time[1])}:${time[2]}` : FALLBACK;
    }
    default:
      return FALLBACK;
  }
}

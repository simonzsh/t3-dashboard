const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const pad = (value: string) => value.padStart(2, "0");

// Only the common shapes get a English label: any other cron stays raw.
export function cronLabel(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  const [minute = "", hour = "", dom, month, dow = ""] = fields;
  if (fields.length !== 5 || dom !== "*" || month !== "*") return cron;

  const step = /^\*\/(\d+)$/.exec(minute)?.[1];
  if (step && dow === "*") {
    if (hour === "*") return `every ${step} min`;
    const range = /^(\d{1,2})-(\d{1,2})$/.exec(hour);
    if (range) return `every ${step} min, ${pad(range[1]!)}:00–${pad(range[2]!)}:00`;
    return cron;
  }

  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return cron;
  const time = `${pad(hour)}:${pad(minute)}`;
  if (dow === "*") return `daily at ${time}`;
  if (dow === "1-5") return `weekdays at ${time}`;
  if (/^[0-7]$/.test(dow)) return `${DAYS[Number(dow)]} at ${time}`;
  return cron;
}

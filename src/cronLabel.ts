const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const pad = (value: string) => value.padStart(2, "0");

// Only the common shapes get a French label: any other cron stays raw.
export function cronLabel(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  const [minute = "", hour = "", dom, month, dow = ""] = fields;
  if (fields.length !== 5 || dom !== "*" || month !== "*") return cron;

  const step = /^\*\/(\d+)$/.exec(minute)?.[1];
  if (step && dow === "*") {
    if (hour === "*") return `toutes les ${step} min`;
    const range = /^(\d{1,2})-(\d{1,2})$/.exec(hour);
    if (range) return `toutes les ${step} min, ${range[1]}h-${range[2]}h`;
    return cron;
  }

  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return cron;
  const time = `${pad(hour)}:${pad(minute)}`;
  if (dow === "*") return `tous les jours à ${time}`;
  if (dow === "1-5") return `jours ouvrés à ${time}`;
  if (/^[0-7]$/.test(dow)) return `le ${DAYS[Number(dow)]} à ${time}`;
  return cron;
}

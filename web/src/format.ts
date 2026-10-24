export function relativeTime(iso: string, now: Date): string {
  const min = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${Math.floor(min)} min`;
  if (min < 1440) return `il y a ${Math.floor(min / 60)} h`;
  return `il y a ${Math.floor(min / 1440)} j`;
}

export function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

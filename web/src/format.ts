export function relativeTime(iso: string, now: Date): string {
  const min = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / 1440)} d ago`;
}

export function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Deep link understood by the T3 Code desktop app (0.0.46 and later).
export function t3CodeLink(environmentId: string | null, threadId: string): string | null {
  if (!environmentId) return null;
  return `t3code://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`;
}

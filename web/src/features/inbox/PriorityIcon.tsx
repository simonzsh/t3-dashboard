// Linear's priority marks: 1 urgent, 2 high, 3 medium, 4 low, 0 none.
const BARS = { 2: 3, 3: 2, 4: 1 } as const;

export function PriorityIcon({ priority, label }: { priority: number; label: string }) {
  if (priority === 1) {
    return (
      <svg className="prio-icon urgent" viewBox="0 0 16 16" role="img" aria-label={label} data-tooltip={label}>
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
        <path d="M8 4.5v4.5M8 11.5v.01" stroke="var(--surface-1)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  const lit = BARS[priority as keyof typeof BARS];
  if (!lit) {
    return (
      <svg className="prio-icon" viewBox="0 0 16 16" role="img" aria-label={label} data-tooltip={label}>
        <path d="M2 8h2.5M6.75 8h2.5M11.5 8H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg className="prio-icon" viewBox="0 0 16 16" role="img" aria-label={label} data-tooltip={label}>
      {[0, 1, 2].map((n) => (
        <rect key={n} x={1.5 + n * 5} y={10 - n * 4} width="3" height={4.5 + n * 4} rx="1" fill="currentColor" opacity={n < lit ? 1 : 0.28} />
      ))}
    </svg>
  );
}

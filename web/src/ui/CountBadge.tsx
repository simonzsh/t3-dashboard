interface Props {
  count: number;
  /** Above this count the badge shows "max+". */
  max?: number;
  /** Accessible name; the badge then has role="img". */
  label?: string;
  /** For a badge whose count is said elsewhere. */
  hidden?: boolean;
  className?: string;
}

export function CountBadge({ count, max = 99, label, hidden, className }: Props) {
  if (count <= 0) return null;
  return (
    <span className={className ? `count-badge ${className}` : "count-badge"} role={label ? "img" : undefined} aria-label={label} aria-hidden={hidden ? "true" : undefined}>
      {count > max ? `${max}+` : count}
    </span>
  );
}

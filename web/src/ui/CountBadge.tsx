interface Props {
  count: number;
  tone?: "accent" | "neutral";
  showZero?: boolean;
  /** Above this count the badge shows "max+". */
  max?: number;
  /** Accessible name; the badge then has role="img". */
  label?: string;
  /** For a badge whose count is said elsewhere. */
  hidden?: boolean;
  className?: string;
}

export function CountBadge({ count, max = 99, label, hidden, className, tone = "accent", showZero = false }: Props) {
  if (count <= 0 && !showZero) return null;
  return (
    <span className={["count-badge", tone === "neutral" && "neutral", className].filter(Boolean).join(" ")} role={label ? "img" : undefined} aria-label={label} aria-hidden={hidden ? "true" : undefined}>
      {count > max ? `${max}+` : count}
    </span>
  );
}

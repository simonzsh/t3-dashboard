export function RunningDot({ className, label }: { className?: string; label?: string }) {
  return <span className={["pulse", className].filter(Boolean).join(" ")} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

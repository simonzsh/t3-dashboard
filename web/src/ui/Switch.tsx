interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name: a switch has no visible text. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/** An on/off setting that acts at once. Space and Enter toggle it, like any button. */
export function Switch({ checked, onChange, label, disabled = false, className }: Props) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={["switch", className].filter(Boolean).join(" ")} onClick={() => onChange(!checked)}>
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}

interface Props<T extends string | number> {
  label: string;
  /** The options that are on. */
  value: readonly T[];
  options: ReadonlyArray<{ id: T; label: string }>;
  onToggle: (id: T) => void;
}

/** Several options that each turn on and off, for example weekdays. */
export function ToggleGroup<T extends string | number>({ label, value, options, onToggle }: Props<T>) {
  return (
    <div className="toggle-group" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value.includes(o.id)} onClick={() => onToggle(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

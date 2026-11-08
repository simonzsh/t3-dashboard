import type { ReactNode } from "react";
import { onRadioKeyDown, rovingTabIndex } from "./radioKeys.ts";

interface Props<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string; icon?: ReactNode }>;
  onChange: (id: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  const anyChecked = options.some((x) => x.id === value);
  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={onRadioKeyDown}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} tabIndex={rovingTabIndex(value === o.id, o === options[0], anyChecked)} className={value === o.id ? "active" : ""} onClick={() => onChange(o.id)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

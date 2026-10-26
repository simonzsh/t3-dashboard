import type { KeyboardEvent } from "react";
import { nextRadioIndex } from "./radioKeys.ts";

interface Props<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (id: T) => void;
  /** Prefix of the ids: the panel takes the id `${idPrefix}-panel` and sets `aria-labelledby` to `${idPrefix}-${id}`. */
  idPrefix: string;
  className?: string;
}

/** A tab list; the caller renders the one visible `role="tabpanel"`. Arrow keys move between the tabs. */
export function Tabs<T extends string>({ label, value, options, onChange, idPrefix, className }: Props<T>) {
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const next = nextRadioIndex(e.key, options.findIndex((o) => o.id === value), options.length);
    if (next === null) return;
    e.preventDefault();
    onChange(options[next]!.id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }
  return (
    <div className={className ? `tabs ${className}` : "tabs"} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" id={`${idPrefix}-${o.id}`} aria-selected={value === o.id} aria-controls={`${idPrefix}-panel`} tabIndex={value === o.id ? 0 : -1} className={value === o.id ? "active" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

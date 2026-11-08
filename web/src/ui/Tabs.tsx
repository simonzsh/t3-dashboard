import type { KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon.tsx";
import { nextRadioIndex } from "./radioKeys.ts";

export interface TabOption<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
  /** A count pill after the label (for example the number of changed files). */
  count?: number;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<TabOption<T>>;
  onChange: (id: T) => void;
  /** Prefix of the ids: the panel takes the id `${idPrefix}-panel` and sets `aria-labelledby` to `${idPrefix}-${id}`. */
  idPrefix: string;
  /** `pill` (default) for a compact switch; `underline` for page tabs: a full-width bar, the current tab underlined. */
  variant?: "pill" | "underline";
  className?: string;
}

/** A tab list; the caller renders the one visible `role="tabpanel"`. Arrow keys move between the tabs. */
export function Tabs<T extends string>({ label, value, options, onChange, idPrefix, variant = "pill", className }: Props<T>) {
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const next = nextRadioIndex(e.key, options.findIndex((o) => o.id === value), options.length);
    if (next === null) return;
    e.preventDefault();
    onChange(options[next]!.id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }
  const classes = ["tabs", variant === "underline" && "underline", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" id={`${idPrefix}-${o.id}`} aria-selected={value === o.id} aria-controls={`${idPrefix}-panel`} tabIndex={value === o.id ? 0 : -1} className={value === o.id ? "active" : ""} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} />}
          {o.label}
          {o.count !== undefined && <span className="tabs-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

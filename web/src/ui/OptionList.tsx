import type { ReactNode } from "react";

interface Props<T> {
  /** id of the listbox: the combobox's aria-controls. */
  id: string;
  label: string;
  items: readonly T[];
  /** From useListNav. */
  active: number;
  /** Same as useListNav's itemId: row ids for aria-activedescendant. */
  itemId: (index: number) => string;
  itemKey: (item: T, index: number) => string;
  /** aria-selected; default: the active row (suggestion list). A choice list passes "is the current value". */
  isSelected?: (item: T, index: number) => boolean;
  /** Pass nav.hover. Called on mouse move (not mouseenter), so a keyboard-scrolled list under a still pointer keeps its row. */
  onHover: (index: number) => void;
  onPick: (item: T, index: number) => void;
  /** Row content. */
  children: (item: T, index: number) => ReactNode;
  /** Shown when items is empty; nothing by default. */
  empty?: ReactNode;
  /** Extra classes on the listbox (always "dropdown-list"). */
  className?: string;
  /** Extra classes on every row (always "dropdown-option" + "active"). */
  optionClassName?: string;
}

/** A listbox of rows that never take the focus: the owner keeps it in its field and drives `active`. */
export function OptionList<T>({ id, label, items, active, itemId, itemKey, isSelected, onHover, onPick, children, empty, className, optionClassName }: Props<T>) {
  return (
    <div id={id} role="listbox" aria-label={label} className={className ? `dropdown-list ${className}` : "dropdown-list"}>
      {items.length === 0 && empty}
      {items.map((item, i) => (
        <div
          key={itemKey(item, i)}
          id={itemId(i)}
          role="option"
          aria-selected={isSelected ? isSelected(item, i) : i === active}
          className={["dropdown-option", i === active && "active", optionClassName].filter(Boolean).join(" ")}
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => i !== active && onHover(i)}
          onClick={() => onPick(item, i)}
        >
          {children(item, i)}
        </div>
      ))}
    </div>
  );
}

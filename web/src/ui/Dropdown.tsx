import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { filterOptions, moveActive, showsFilter, type DropdownOption } from "../dropdown.ts";
import { Icon } from "./Icon.tsx";
import { Popover } from "./Popover.tsx";
import { TextInput } from "./TextInput.tsx";

interface Props {
  label: string;
  value: string | null;
  options: DropdownOption[];
  onPick: (id: string) => void;
  icon?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  /** Shows a filter field; by default only long lists get one. */
  filterable?: boolean;
  /** Extra classes on the root, e.g. "field" for a form control or "secondary" in the composer. */
  className?: string;
}

export function Dropdown({ label, value, options, onPick, icon, placeholder, disabled = false, filterable, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const id = useId();
  const current = options.find((o) => o.id === value);
  const withFilter = showsFilter(options.length, filterable);
  const shown = filterOptions(options, query);

  useEffect(() => {
    if (open) (withFilter ? filter.current : list.current)?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    setQuery("");
    setActive(options.findIndex((o) => o.id === value));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function pick(option: DropdownOption) {
    close(true);
    if (option.id !== value) onPick(option.id);
  }

  // Escape is handled by the Popover, which stops it from reaching a dialog or the Desk.
  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(moveActive(shown.length, active, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = shown[active];
      if (option) pick(option);
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <div className={`dropdown ${className}`.trim()} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="dropdown-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : show())}
      >
        {icon ?? current?.icon}
        <span className={`dropdown-value${current ? "" : " placeholder"}`}>{current?.label ?? value ?? placeholder ?? label}</span>
        <Icon name="chevron" className="icon chevron-down" />
      </button>
      {open && (
        <Popover
          anchor={trigger}
          className="dropdown-menu"
          minWidth={className.includes("field") ? 0 : 210}
          matchWidth
          onClose={(reason) => close(reason === "escape")}
        >
          {withFilter && (
            <TextInput
              ref={filter}
              className="dropdown-filter"
              placeholder="Filter…"
              aria-label={`Filter ${label}`}
              aria-controls={`${id}-list`}
              aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(filterOptions(options, e.target.value).length > 0 ? 0 : -1);
              }}
            />
          )}
          <div
            ref={list}
            id={`${id}-list`}
            className="dropdown-list"
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={!withFilter && active >= 0 ? `${id}-${active}` : undefined}
          >
            {shown.length === 0 && <div className="dropdown-empty">No match</div>}
            {shown.map((o, i) => (
              <div key={o.id} className="dropdown-entry">
                {o.group && o.group !== shown[i - 1]?.group && <div className="dropdown-group">{o.group}</div>}
                <div
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={o.id === value}
                  className={`dropdown-option${i === active ? " active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                >
                  {o.icon}
                  <span className="dropdown-text">
                    <span>{o.label}</span>
                    {o.description && <small>{o.description}</small>}
                  </span>
                  {o.id === value && <Icon name="check" className="icon dropdown-check" />}
                </div>
              </div>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

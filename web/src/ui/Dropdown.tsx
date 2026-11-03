import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { filterOptions, moveActive, showsFilter, type DropdownOption } from "../lib/dropdown.ts";
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
  /** Shows a search field in place of the trigger; by default only long lists get one. */
  filterable?: boolean;
  /** Placeholder of the search field, e.g. "Search projects…". */
  searchPlaceholder?: string;
  /** Extra classes on the root, e.g. "field" for a form control or "secondary" in the composer. */
  className?: string;
  /** Opens the menu on mount, e.g. when the choice is the first step of a dialog. */
  defaultOpen?: boolean;
  /** Called after every pick, the current option too; the owner then moves the focus. */
  onPicked?: () => void;
}

export function Dropdown({ label, value, options, onPick, icon, placeholder, disabled = false, filterable, searchPlaceholder = "Search…", className = "", defaultOpen = false, onPicked }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(() => (defaultOpen ? options.findIndex((o) => o.id === value) : -1));
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const id = useId();
  const current = options.find((o) => o.id === value);
  const withFilter = showsFilter(options.length, filterable);
  const searching = open && withFilter;
  // A form field shows the search in its own place; a compact picker keeps it in the menu.
  const inPlace = className.includes("field");
  const shown = filterOptions(options, query);

  useEffect(() => {
    if (!open) return;
    // On a touch screen, a compact menu does not focus its search: no keyboard pops up.
    const focusSearch = withFilter && (inPlace || !matchMedia("(pointer: coarse)").matches);
    (focusSearch ? filter.current : list.current)?.focus({ preventScroll: true });
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
    close(!onPicked);
    if (option.id !== value) onPick(option.id);
    onPicked?.();
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

  const search = (
    <TextInput
      ref={filter}
      className={inPlace ? "dropdown-search" : "dropdown-filter"}
      role="combobox"
      aria-expanded
      placeholder={searchPlaceholder}
      aria-label={searchPlaceholder.replace(/…$/, "")}
      aria-controls={`${id}-list`}
      aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
      value={query}
      onChange={(e) => {
        setQuery(e.target.value);
        setActive(filterOptions(options, e.target.value).length > 0 ? 0 : -1);
      }}
    />
  );

  return (
    <div className={`dropdown ${className}${searching && inPlace ? " searching" : ""}`.trim()} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="dropdown-trigger"
        aria-label={label}
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
      {searching && inPlace && search}
      {open && (
        <Popover
          anchor={searching && inPlace ? filter : trigger}
          className="dropdown-menu"
          minWidth={inPlace ? 0 : 210}
          matchWidth
          onClose={(reason) => close(reason === "escape")}
        >
          {searching && !inPlace && search}
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
              <div key={o.id}>
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

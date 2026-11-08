import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { filterOptions, showsFilter, type DropdownOption } from "../lib/dropdown.ts";
import { Icon } from "./Icon.tsx";
import { isTouch } from "./media.ts";
import { Popover } from "./Popover.tsx";
import { TextInput } from "./TextInput.tsx";
import { useListNav } from "./useListNav.ts";

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
  /** The owner filters, e.g. on the server: options are shown as given, and each search change is reported. */
  onQuery?: (query: string) => void;
  /** Trigger text instead of the current option's label. */
  valueLabel?: string;
  /** Shown under the list, e.g. a setting of the menu. */
  footer?: ReactNode;
  align?: "start" | "end";
}

export function Dropdown({ label, value, options, onPick, icon, placeholder, disabled = false, filterable, searchPlaceholder = "Search…", className = "", defaultOpen = false, onPicked, onQuery, valueLabel, footer, align }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const id = useId();
  const current = options.find((o) => o.id === value);
  const withFilter = showsFilter(options.length, filterable);
  const searching = open && withFilter;
  // A form field shows the search in its own place; a compact picker keeps it in the menu.
  const inPlace = className.includes("field");
  const shown = onQuery ? options : filterOptions(options, query);
  const { active, setActive, hover, onKeyDown: navKeyDown } = useListNav(shown.length, {
    initial: defaultOpen ? options.findIndex((o) => o.id === value) : -1,
    onPick: (i) => pick(shown[i]!),
    itemId: (i) => `${id}-${i}`,
  });

  useEffect(() => {
    if (!open) return;
    // On a touch screen, a compact menu does not focus its search: no keyboard pops up.
    const focusSearch = withFilter && (inPlace || !isTouch());
    (focusSearch ? filter.current : list.current)?.focus({ preventScroll: true });
  }, [open]);

  function show() {
    setQuery("");
    onQuery?.("");
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

  // Escape is handled by the Popover, which stops it from reaching a dialog or the Sessions page.
  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        show();
      }
      return;
    }
    if (navKeyDown(e)) return;
    if (e.key === "Enter") e.preventDefault();
    else if (e.key === "Tab") close(false);
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
        onQuery?.(e.target.value);
        setActive(onQuery || filterOptions(options, e.target.value).length > 0 ? 0 : -1);
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
        <span className={`dropdown-value${current || valueLabel ? "" : " placeholder"}`}>{valueLabel ?? current?.label ?? value ?? placeholder ?? label}</span>
        <Icon name="chevron" className="icon chevron-down" />
      </button>
      {searching && inPlace && search}
      {open && (
        <Popover
          anchor={searching && inPlace ? filter : trigger}
          className="dropdown-menu"
          align={align}
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
                  onMouseEnter={() => hover(i)}
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
          {/* Its own keys (a switch) must not pick the active option. */}
          {footer && <div className="dropdown-footer" onKeyDown={(e) => e.stopPropagation()}>{footer}</div>}
        </Popover>
      )}
    </div>
  );
}

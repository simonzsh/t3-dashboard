import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DashboardProvider, ModelSelection, RuntimeMode } from "../../../../shared/api.ts";
import { RUNTIME_MODE_LABELS, findModel, currentEffort, selectEffort, selectModel } from "./composer.ts";
import { chipLabel, currentSpeed, panelModels, selectSpeed, type PanelRow, type Rail } from "./modelPanel.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Dropdown, Icon, OptionList, Popover, Pressable, Segmented, TextInput, isTouch, onRadioKeyDown, rovingTabIndex, trapTab, useListNav } from "../../ui/index.ts";

interface Props {
  providers: DashboardProvider[];
  selection: ModelSelection | null;
  mode?: RuntimeMode | null;
  /** Empty hides the access control (a model-only picker). */
  modes?: RuntimeMode[];
  onSelection: (next: ModelSelection) => void;
  onMode?: (next: RuntimeMode) => void;
  /** Opens in the page flow under the chip (in a form) instead of floating above it. */
  inline?: boolean;
}

const sameRow = (row: PanelRow, selection: ModelSelection | null) => row.provider.instanceId === selection?.instanceId && row.model.slug === selection.model;

/** One chip for the model, its reasoning, speed and the access mode; its panel opens above, inside the composer card. */
export function ModelPanel({ providers, selection, mode = null, modes = [], onSelection, onMode, inline = false }: Props) {
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState<Rail>("favorites");
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const listId = useId();
  // In a form the panel opens in the flow: scroll the form so all of it shows at once.
  useEffect(() => {
    if (open && inline) panel.current?.scrollIntoView({ block: "nearest" });
  }, [open, inline]);
  const search = useRef<HTMLInputElement>(null);

  const found = findModel(providers, selection);
  const label = chipLabel(selection, found);
  const rows = panelModels(providers, rail, query);
  // Home and End stay with the caret of the search field.
  const nav = useListNav(rows.length, { initial: 0, homeEnd: false, onPick: (i) => pickRow(rows[i]), itemId: (i) => `${listId}-${i}` });
  const effort = found?.model.effort ?? null;
  const level = found ? currentEffort(selection, found.model) : null;
  const speed = found && selection ? currentSpeed(selection, found.model) : null;

  function show() {
    // Favorites first; with none, the current provider instead of an empty list.
    const start: Rail = panelModels(providers, "favorites", "").length > 0 ? "favorites" : (found?.provider.instanceId ?? providers[0]?.instanceId ?? "favorites");
    const first = panelModels(providers, start, "");
    setRail(start);
    setQuery("");
    nav.setActive(Math.max(0, first.findIndex((row) => sameRow(row, selection))));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) chip.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    // On a touch screen nothing keeps a field focused: no keyboard covers the panel.
    if (!isTouch()) search.current?.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  }, [open]);

  // A floating panel is a Popover; one in the flow of a form closes by itself.
  useEffect(() => {
    if (!open || !inline) return;
    const down = (e: MouseEvent) => {
      // The Access menu floats in document.body: a click in it is not outside.
      const target = e.target as Element;
      if (!root.current?.contains(target) && !target.closest(".popover")) setOpen(false);
    };
    // Capture and stop: the dialog around the form must not also react to this Escape.
    const key = (e: globalThis.KeyboardEvent) => {
      // An open menu (Access) takes this Escape; the panel stays.
      if (e.key !== "Escape" || document.querySelector(".popover")) return;
      e.stopPropagation();
      close(true);
    };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key, true);
    };
  }, [open, inline]);

  function pickRow(row: PanelRow | undefined) {
    if (!row) return;
    if (!sameRow(row, selection)) onSelection(selectModel(selection, row.provider, row.model));
    close(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    // The panel is its own dialog in a portal: Tab cycles inside it.
    if (e.key === "Tab") {
      e.stopPropagation();
      return trapTab(e);
    }
    if (e.target === search.current) nav.onKeyDown(e);
  }

  const railButton = (id: Rail, name: string, icon: ReactNode) => (
    <Pressable
      key={id}
      className={`model-rail-button${rail === id ? " active" : ""}`}
      aria-label={name}
      aria-pressed={rail === id}
      tooltip={name}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setRail(id);
        setQuery("");
        nav.setActive(0);
        if (!isTouch()) search.current?.focus({ preventScroll: true });
      }}
    >
      {icon}
    </Pressable>
  );

  const body = (
    <div className="model-panel-inner" role="dialog" aria-label="Model, reasoning and access" onKeyDown={onKeyDown}>
      <div className="model-panel-body">
        <div className="model-rail">
          {railButton("favorites", "Favorites", <Icon name={rail === "favorites" ? "starFilled" : "star"} />)}
          <span className="model-rail-sep" aria-hidden="true" />
          {providers.map((p) => railButton(p.instanceId, p.displayName, <ProviderIcon provider={p.instanceId} driver={p.driver} />))}
        </div>
        <div className="model-main">
          <div className="model-search">
            <Icon name="search" />
            <TextInput
              ref={search}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={nav.active >= 0 ? `${listId}-${nav.active}` : undefined}
              aria-label="Search models"
              placeholder="Search models..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                nav.setActive(0);
              }}
            />
          </div>
          <OptionList
            id={listId}
            label="Models"
            className="model-list"
            items={rows}
            active={nav.active}
            itemId={(i) => `${listId}-${i}`}
            itemKey={(row) => `${row.provider.instanceId}\u0000${row.model.slug}`}
            isSelected={(row) => sameRow(row, selection)}
            onHover={nav.hover}
            onPick={pickRow}
            empty={<div className="model-empty">{query.trim() === "" && rail === "favorites" ? "No favorites yet" : "No models found"}</div>}
          >
            {(row) => (
              <>
                <ProviderIcon provider={row.provider.instanceId} driver={row.provider.driver} />
                <span className="model-name">{row.model.name}</span>
                {/* T3 Code owns the favorites: the star only shows them. */}
                {row.model.favorite !== null && <Icon name="starFilled" className="icon model-star" label="Favorite" />}
              </>
            )}
          </OptionList>
        </div>
        <div className="model-options">
          {effort && found && selection ? (
            <>
              <div className="model-options-head">
                <span>{effort.label}</span>
                <small>{found.model.name}</small>
              </div>
              <div role="radiogroup" aria-label={effort.label} onKeyDown={onRadioKeyDown}>
                {effort.levels.map((l, i) => (
                  <Pressable
                    key={l.id}
                    role="radio"
                    aria-checked={l.id === level}
                    tabIndex={rovingTabIndex(l.id === level, i === 0, effort.levels.some((x) => x.id === level))}
                    className="model-level"
                    onClick={() => onSelection(selectEffort(selection, found.model, l.id))}
                  >
                    <span className="model-level-name">{l.label}</span>
                    {l.id === effort.defaultLevel && <small>Default</small>}
                    <Icon name="check" className={`icon model-level-check${l.id === level ? "" : " hidden"}`} />
                  </Pressable>
                ))}
              </div>
            </>
          ) : (
            <div className="model-empty">No options for this model</div>
          )}
        </div>
      </div>
      <div className="model-footer">
        {found?.model.speed && selection && (
          <Segmented
            label="Speed"
            value={speed ?? "standard"}
            options={[{ id: "standard", label: "Standard" }, { id: "fast", label: "Fast", icon: <Icon name="bolt" className="icon segmented-icon" /> }]}
            onChange={(id) => onSelection(selectSpeed(selection, found.model, id === "fast"))}
          />
        )}
        {modes.length > 0 && (
          <Dropdown
            label="Access"
            className="model-access"
            align="end"
            value={mode}
            disabled={!mode}
            icon={<Icon name={mode === "full-access" ? "unlock" : "lock"} />}
            options={modes.map((m) => ({ id: m, label: RUNTIME_MODE_LABELS[m].label, description: RUNTIME_MODE_LABELS[m].description }))}
            onPick={(id) => onMode?.(id as RuntimeMode)}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={`model-picker${inline ? " inline" : ""}`} ref={root}>
      <Pressable ref={chip} className="model-chip" aria-label="Model, reasoning and access" aria-haspopup="dialog" aria-expanded={open} disabled={!selection} onClick={() => (open ? close(false) : show())}>
        {selection && <ProviderIcon provider={selection.instanceId} driver={found?.provider.driver} />}
        <span className="model-chip-name">{label.name}</span>
        {label.effort && <span className="model-chip-effort">{label.effort}</span>}
        {label.fast && <Icon name="bolt" className="icon model-chip-fast" />}
      </Pressable>
      {open && inline && (
        <div ref={panel} className="model-panel">
          {body}
        </div>
      )}
      {open && !inline && (
        <Popover anchor={chip} preferAbove className="model-panel" onClose={(reason) => close(reason === "escape")}>
          {body}
        </Popover>
      )}
    </div>
  );
}

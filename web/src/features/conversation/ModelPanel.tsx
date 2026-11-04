import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DashboardProvider, ModelSelection, RuntimeMode } from "../../../../shared/api.ts";
import { RUNTIME_MODE_LABELS, findModel, currentEffort, selectEffort, selectModel } from "./composer.ts";
import { chipLabel, currentSpeed, panelModels, selectSpeed, type PanelRow, type Rail } from "./modelPanel.ts";
import { moveActive } from "../../lib/dropdown.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Icon, Pressable, Segmented, TextInput } from "../../ui/index.ts";

interface Props {
  providers: DashboardProvider[];
  selection: ModelSelection | null;
  mode: RuntimeMode | null;
  modes: RuntimeMode[];
  onSelection: (next: ModelSelection) => void;
  onMode: (next: RuntimeMode) => void;
}

const sameRow = (row: PanelRow, selection: ModelSelection | null) => row.provider.instanceId === selection?.instanceId && row.model.slug === selection.model;

/** One chip for the model, its reasoning, speed and the access mode; its panel opens above, inside the composer card. */
const touch = () => matchMedia("(pointer: coarse)").matches;

export function ModelPanel({ providers, selection, mode, modes, onSelection, onMode }: Props) {
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState<Rail>("favorites");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [accessOpen, setAccessOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // A desk window clips what overflows it: keep the panel within the room above the composer.
  useLayoutEffect(() => {
    const box = panel.current;
    const anchor = box?.offsetParent;
    if (!box || !anchor) return;
    const top = anchor.getBoundingClientRect().top;
    const frame = anchor.closest(".desk-window")?.getBoundingClientRect().top ?? 0;
    box.style.maxHeight = `${Math.max(180, top - frame - 12)}px`;
  });
  const chip = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const found = findModel(providers, selection);
  const label = chipLabel(selection, found);
  const rows = panelModels(providers, rail, query);
  const effort = found?.model.effort ?? null;
  const level = found ? currentEffort(selection, found.model) : null;
  const speed = found && selection ? currentSpeed(selection, found.model) : null;

  function show() {
    // Favorites first; with none, the current provider instead of an empty list.
    const start: Rail = panelModels(providers, "favorites", "").length > 0 ? "favorites" : (found?.provider.instanceId ?? providers[0]?.instanceId ?? "favorites");
    const first = panelModels(providers, start, "");
    setRail(start);
    setQuery("");
    setActive(Math.max(0, first.findIndex((row) => sameRow(row, selection))));
    setAccessOpen(false);
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) chip.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    // On a touch screen nothing keeps a field focused: no keyboard covers the panel.
    if (!touch()) search.current?.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    const down = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture and stop: the Desk must not also react to this Escape.
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (accessOpen) setAccessOpen(false);
      else close(true);
    };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key, true);
    };
  }, [open, accessOpen]);

  // Only the keyboard and the opening scroll the list: a row under the mouse must not move it.
  const follow = useRef(true);
  useEffect(() => {
    if (open && follow.current) document.getElementById(`model-row-${active}`)?.scrollIntoView({ block: "nearest" });
    follow.current = true;
  }, [open, active]);

  function pickRow(row: PanelRow | undefined) {
    if (!row) return;
    if (!sameRow(row, selection)) onSelection(selectModel(selection, row.provider, row.model));
    // A model with options keeps the panel open, so its reasoning or speed can follow.
    if (!row.model.effort && !row.model.speed) close(true);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target === search.current && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive(moveActive(rows.length, active, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.target === search.current && e.key === "Enter") {
      e.preventDefault();
      pickRow(rows[active]);
    }
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
        setActive(0);
        if (!touch()) search.current?.focus({ preventScroll: true });
      }}
    >
      {icon}
    </Pressable>
  );

  return (
    <div className="model-picker" ref={root}>
      <Pressable ref={chip} className="model-chip" aria-label="Model, reasoning and access" aria-haspopup="dialog" aria-expanded={open} disabled={!selection} onClick={() => (open ? close(false) : show())}>
        {selection && <ProviderIcon provider={selection.instanceId} />}
        <span className="model-chip-name">{label.name}</span>
        {label.effort && <span className="model-chip-effort">{label.effort}</span>}
        {label.fast && <Icon name="bolt" className="icon model-chip-fast" />}
      </Pressable>
      {open && (
        <div ref={panel} className="model-panel" role="dialog" aria-label="Model, reasoning and access" onKeyDown={onKeyDown}>
          <div className="model-panel-body">
            <div className="model-rail">
              {railButton("favorites", "Favorites", <Icon name={rail === "favorites" ? "starFilled" : "star"} />)}
              <span className="model-rail-sep" aria-hidden="true" />
              {providers.map((p) => railButton(p.instanceId, p.displayName, <ProviderIcon provider={p.instanceId} />))}
            </div>
            <div className="model-main">
              <div className="model-search">
                <Icon name="search" />
                <TextInput
                  ref={search}
                  role="combobox"
                  aria-expanded
                  aria-controls="model-list"
                  aria-activedescendant={rows.length > 0 ? `model-row-${active}` : undefined}
                  aria-label="Search models"
                  placeholder="Search models..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                />
              </div>
              <div id="model-list" className="model-list" role="listbox" aria-label="Models">
                {rows.length === 0 && <div className="model-empty">{query.trim() === "" && rail === "favorites" ? "No favorites yet" : "No models found"}</div>}
                {rows.map((row, i) => {
                  return (
                    <Pressable
                      key={`${row.provider.instanceId}\u0000${row.model.slug}`}
                      id={`model-row-${i}`}
                      role="option"
                      aria-selected={sameRow(row, selection)}
                      className={`model-row${i === active ? " active" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => {
                        if (i === active) return;
                        follow.current = false;
                        setActive(i);
                      }}
                      onClick={() => pickRow(row)}
                    >
                      <ProviderIcon provider={row.provider.instanceId} />
                      <span className="model-row-name">{row.model.name}</span>
                      {/* T3 Code owns the favorites: the star only shows them. */}
                      {row.model.favorite !== null && <Icon name="starFilled" className="icon model-row-star" label="Favorite" />}
                    </Pressable>
                  );
                })}
              </div>
            </div>
            <div className="model-options">
              {effort && found && selection ? (
                <>
                  <div className="model-options-head">
                    <span>{effort.label}</span>
                    <small>{found.model.name}</small>
                  </div>
                  <div role="radiogroup" aria-label={effort.label}>
                    {effort.levels.map((l) => (
                      <Pressable key={l.id} role="radio" aria-checked={l.id === level} className="model-level" onClick={() => onSelection(selectEffort(selection, found.model, l.id))}>
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
            <div className="model-access">
              <Pressable className="model-access-button" aria-label="Access" aria-haspopup="listbox" aria-expanded={accessOpen} disabled={!mode} onClick={() => setAccessOpen((o) => !o)}>
                <Icon name={mode === "full-access" ? "unlock" : "lock"} />
                <span>{mode ? RUNTIME_MODE_LABELS[mode].label : "Access"}</span>
                <Icon name="chevron" className="icon chevron-down" />
              </Pressable>
              {accessOpen && (
                <div className="model-access-menu" role="listbox" aria-label="Access">
                  {modes.map((m) => (
                    <Pressable
                      key={m}
                      role="option"
                      aria-selected={m === mode}
                      className="model-access-option"
                      onClick={() => {
                        setAccessOpen(false);
                        if (m !== mode) onMode(m);
                      }}
                    >
                      <span className="model-access-text">
                        <span>{RUNTIME_MODE_LABELS[m].label}</span>
                        <small>{RUNTIME_MODE_LABELS[m].description}</small>
                      </span>
                      {m === mode && <Icon name="check" className="icon model-level-check" />}
                    </Pressable>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

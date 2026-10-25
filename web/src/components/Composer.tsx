import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DashboardProvider, ImageAttachment, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../shared/api.ts";
import { IMAGE_TYPES, RUNTIME_MODE_LABELS, acceptImages, currentEffort, findModel, modelLabel, selectEffort, selectModel } from "../composer.ts";
import { NO_AUTOFILL } from "../noAutofill.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";

// Icon paths from Lucide (ISC).
const ICONS = {
  chevron: ["m6 9 6 6 6-6"],
  brain: [
    "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
    "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
    "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4",
    "M17.599 6.5a3 3 0 0 0 .399-1.375M6.003 5.125A3 3 0 0 0 6.401 6.5M3.477 10.896a4 4 0 0 1 .585-.396M19.938 10.5a4 4 0 0 1 .585.396M6 18a4 4 0 0 1-1.967-.516M19.967 17.484A4 4 0 0 1 18 18",
  ],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z", "M7 11V7a5 5 0 0 1 10 0v4"],
  unlock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z", "M7 11V7a5 5 0 0 1 9.9-1"],
  paperclip: ["m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"],
  arrowUp: ["M12 19V5", "m5 12 7-7 7 7"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  check: ["M20 6 9 17l-5-5"],
};

function Icon({ name, className = "icon" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

interface Option {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  group?: string;
}

interface PickerProps {
  label: string;
  icon: ReactNode;
  value: string | null;
  options: Option[];
  disabled: boolean;
  /** Narrow composers show only the icon of a secondary picker. */
  secondary?: boolean;
  onPick: (id: string) => void;
}

function Picker({ label, icon, value, options, disabled, secondary = false, onPick }: PickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Escape closes the menu only: without stopPropagation the Desk would also leave fullscreen.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className={`picker${secondary ? " secondary" : ""}`} ref={root} onKeyDown={onKeyDown}>
      <button type="button" className="picker-trigger" aria-label={label} title={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>
        {icon}
        <span className="picker-value">{current?.label ?? value ?? label}</span>
        <Icon name="chevron" className="icon chevron-down" />
      </button>
      {open && (
        <div className="picker-menu" role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <div key={o.id} className="picker-entry">
              {o.group && o.group !== options[i - 1]?.group && <div className="picker-group">{o.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={o.id === value}
                autoFocus={o.id === value}
                onClick={() => {
                  setOpen(false);
                  if (o.id !== value) onPick(o.id);
                }}
              >
                {o.icon}
                <span className="picker-text">
                  <span>{o.label}</span>
                  {o.description && <small>{o.description}</small>}
                </span>
                {o.id === value && <Icon name="check" className="icon picker-check" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Pending {
  key: string;
  file: File;
  dataUrl: string;
}

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

interface Props {
  providers: DashboardProvider[];
  selection: ModelSelection | null;
  runtimeMode: RuntimeMode | null;
  /** A run is active: Send steers it and Stop appears. */
  running: boolean;
  draft: string;
  onDraft: (text: string) => void;
  onSend: (text: string, attachments: ImageAttachment[]) => Promise<boolean>;
  onStop: () => Promise<boolean>;
  onSettings: (change: ThreadSettingsBody) => Promise<boolean>;
  /** Reloads the thread: its values replace picks that could not be rolled back. */
  onReload: () => void;
  /** Error of the last send, stop or settings change. */
  error: string | null;
}

export function Composer({ providers, selection, runtimeMode, running, draft, onDraft, onSend, onStop, onSettings, onReload, error: actionError }: Props) {
  // Picks show at once; the thread values come back on the next reload.
  const [localSelection, setLocalSelection] = useState(selection);
  const [localMode, setLocalMode] = useState(runtimeMode);
  const [images, setImages] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setLocalSelection(selection), [JSON.stringify(selection)]);
  useEffect(() => setLocalMode(runtimeMode), [runtimeMode]);

  // Grows with the text up to the CSS max height.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const found = findModel(providers, localSelection);
  const effort = found ? currentEffort(localSelection, found.model) : null;
  const modes = found?.provider.runtimeModes ?? (Object.keys(RUNTIME_MODE_LABELS) as RuntimeMode[]);
  const canSend = (draft.trim() !== "" || images.length > 0) && !sending;

  // Counts picks: a failed pick rolls back only if no newer pick happened meanwhile.
  const changes = useRef(0);

  async function change(next: { selection?: ModelSelection; mode?: RuntimeMode }) {
    const before = { selection: localSelection, mode: localMode };
    const mine = ++changes.current;
    if (next.selection) setLocalSelection(next.selection);
    if (next.mode) setLocalMode(next.mode);
    setError(null);
    const ok = await onSettings({ ...(next.selection && { modelSelection: next.selection }), ...(next.mode && { runtimeMode: next.mode }) });
    if (ok) return;
    if (mine === changes.current) {
      setLocalSelection(before.selection);
      setLocalMode(before.mode);
    } else {
      onReload();
    }
  }

  async function addFiles(files: File[]) {
    const { accepted, error: refused } = acceptImages(images.map((p) => p.file), files);
    setError(refused);
    try {
      const read = await Promise.all(accepted.map(async (file) => ({ key: crypto.randomUUID(), file, dataUrl: await readDataUrl(file) })));
      setImages((current) => [...current, ...read]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const ok = await onSend(
      draft.trim(),
      images.map((p) => ({ name: p.file.name, mimeType: p.file.type, dataUrl: p.dataUrl })),
    );
    setSending(false);
    if (ok) setImages([]);
  }

  const modelOptions: Option[] = providers.flatMap((p) =>
    p.models.map((m) => ({ id: `${p.instanceId}\u0000${m.slug}`, label: m.name, group: p.displayName, icon: <ProviderIcon provider={p.instanceId} /> })),
  );
  const selectedModelId = localSelection ? `${localSelection.instanceId}\u0000${localSelection.model}` : null;
  if (localSelection && !found) modelOptions.unshift({ id: selectedModelId!, label: localSelection.model });

  return (
    <form
      className="composer"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="composer-card">
        {images.length > 0 && (
          <ul className="composer-files" aria-label="Attached images">
            {images.map((p) => (
              <li key={p.key} className="file-chip">
                <img src={p.dataUrl} alt="" />
                <span title={p.file.name}>{p.file.name}</span>
                <button type="button" aria-label={`Remove ${p.file.name}`} title="Remove" onClick={() => setImages((current) => current.filter((x) => x.key !== p.key))}>
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          {...NO_AUTOFILL}
          ref={textarea}
          rows={2}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
            if (files.length === 0) return;
            e.preventDefault();
            void addFiles(files);
          }}
          placeholder={running ? "Steer the agent…" : "Send a message to the agent…"}
          aria-label="Message"
        />
        <div className="composer-toolbar">
          <div className="composer-pickers">
            <Picker
              label="Model"
              icon={localSelection ? <ProviderIcon provider={localSelection.instanceId} /> : null}
              value={selectedModelId}
              options={modelOptions}
              disabled={!localSelection}
              onPick={(id) => {
                const [instanceId, slug] = id.split("\u0000");
                const provider = providers.find((p) => p.instanceId === instanceId);
                const model = provider?.models.find((m) => m.slug === slug);
                if (provider && model) void change({ selection: selectModel(localSelection, provider, model) });
              }}
            />
            {found?.model.effort && localSelection && (
              <>
                <span className="composer-sep" aria-hidden="true" />
                <Picker
                  label="Reasoning effort"
                  icon={<Icon name="brain" />}
                  value={effort}
                  options={found.model.effort.levels}
                  disabled={false}
                  secondary
                  onPick={(level) => void change({ selection: selectEffort(localSelection, found.model, level) })}
                />
              </>
            )}
            <span className="composer-sep" aria-hidden="true" />
            <Picker
              label="Access"
              icon={<Icon name={localMode === "full-access" ? "unlock" : "lock"} />}
              value={localMode}
              options={modes.map((mode) => ({ id: mode, ...RUNTIME_MODE_LABELS[mode] }))}
              disabled={!localMode}
              secondary
              onPick={(mode) => void change({ mode: mode as RuntimeMode })}
            />
          </div>
          <div className="composer-actions">
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              multiple
              hidden
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <button type="button" className="composer-icon" aria-label="Attach images" title="Attach images" onClick={() => fileInput.current?.click()}>
              <Icon name="paperclip" />
            </button>
            {running && (
              <button
                type="button"
                className="composer-round stop"
                aria-label="Stop"
                title="Stop the run"
                disabled={stopping}
                onClick={async () => {
                  setStopping(true);
                  await onStop();
                  setStopping(false);
                }}
              >
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
              </button>
            )}
            <button type="submit" className="composer-round send" aria-label={running ? "Steer" : "Send"} title={running ? "Send now (steers the run)" : "Send (Enter)"} disabled={!canSend}>
              <Icon name="arrowUp" />
            </button>
          </div>
        </div>
      </div>
      {(error ?? actionError) && <span className="error">{error ?? actionError}</span>}
    </form>
  );
}

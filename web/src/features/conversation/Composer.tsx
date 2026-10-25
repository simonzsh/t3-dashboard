import { useEffect, useRef, useState } from "react";
import type { DashboardProvider, ImageAttachment, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../../shared/api.ts";
import { IMAGE_TYPES } from "../../../../shared/limits.ts";
import { RUNTIME_MODE_LABELS, acceptImages, currentEffort, findModel, selectEffort, selectModel } from "./composer.ts";
import type { DropdownOption } from "../../lib/dropdown.ts";
import { Dropdown, FileInput, Icon, IconButton, Pressable, TextArea } from "../../ui/index.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { errorMessage } from "../../lib/format.ts";

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
  /** Each callback throws on failure: the Composer shows the error. */
  onSend: (text: string, attachments: ImageAttachment[]) => Promise<void>;
  /** Without it, no Stop button. */
  onStop?: () => Promise<unknown>;
  onSettings: (change: ThreadSettingsBody) => Promise<void> | void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function Composer({ providers, selection, runtimeMode, running, draft, onDraft, onSend, onStop, onSettings, placeholder, autoFocus = false }: Props) {
  // Picks show at once, until new values come in the props or the change fails.
  const [override, setOverride] = useState<{ selection?: ModelSelection; mode?: RuntimeMode }>({});
  const [images, setImages] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Each reload gives a new selection object: compare the values.
  useEffect(() => setOverride({}), [JSON.stringify(selection), runtimeMode]);
  const localSelection = override.selection ?? selection;
  const localMode = override.mode ?? runtimeMode;

  // One error line: each attempt replaces it, so an older error never hides a newer one.
  async function attempt(work: () => unknown, setBusy?: (busy: boolean) => void): Promise<boolean> {
    setError(null);
    setBusy?.(true);
    try {
      await work();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy?.(false);
    }
  }

  // Grows with the text up to the CSS max height; measured again when the window resizes,
  // since a size taken while the window was narrow or hidden would stick.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "";
      if (el.value === "" || el.clientWidth === 0) return;
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [draft]);

  const found = findModel(providers, localSelection);
  const effort = found ? currentEffort(localSelection, found.model) : null;
  const modes = found?.provider.runtimeModes ?? (Object.keys(RUNTIME_MODE_LABELS) as RuntimeMode[]);
  const canSend = (draft.trim() !== "" || images.length > 0) && !sending;

  async function change(next: { selection?: ModelSelection; mode?: RuntimeMode }) {
    setOverride((current) => ({ ...current, ...next }));
    const ok = await attempt(() => onSettings({ ...(next.selection && { modelSelection: next.selection }), ...(next.mode && { runtimeMode: next.mode }) }));
    if (!ok) setOverride({});
  }

  async function addFiles(files: File[]) {
    const { accepted, error: refused } = acceptImages(images.map((p) => p.file), files);
    setError(refused);
    try {
      const read = await Promise.all(accepted.map(async (file) => ({ key: crypto.randomUUID(), file, dataUrl: await readDataUrl(file) })));
      setImages((current) => [...current, ...read]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function submit() {
    if (!canSend) return;
    const attachments = images.map((p) => ({ name: p.file.name, mimeType: p.file.type, dataUrl: p.dataUrl }));
    if (await attempt(() => onSend(draft.trim(), attachments), setSending)) setImages([]);
  }

  const modelOptions: DropdownOption[] = providers.flatMap((p) =>
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
                <Pressable aria-label={`Remove ${p.file.name}`} title="Remove" onClick={() => setImages((current) => current.filter((x) => x.key !== p.key))}>
                  <Icon name="x" />
                </Pressable>
              </li>
            ))}
          </ul>
        )}
        <TextArea
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
          autoFocus={autoFocus}
          placeholder={placeholder ?? (running ? "Steer the agent…" : "Send a message to the agent…")}
          aria-label="Message"
        />
        <div className="composer-toolbar">
          <div className="composer-pickers">
            <Dropdown
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
                <Dropdown
                  label="Reasoning effort"
                  icon={<Icon name="brain" />}
                  value={effort}
                  options={found.model.effort.levels}
                  className="secondary"
                  onPick={(level) => void change({ selection: selectEffort(localSelection, found.model, level) })}
                />
              </>
            )}
            <span className="composer-sep" aria-hidden="true" />
            <Dropdown
              label="Access"
              icon={<Icon name={localMode === "full-access" ? "unlock" : "lock"} />}
              value={localMode}
              options={modes.map((mode) => ({ id: mode, ...RUNTIME_MODE_LABELS[mode] }))}
              disabled={!localMode}
              className="secondary"
              onPick={(mode) => void change({ mode: mode as RuntimeMode })}
            />
          </div>
          <div className="composer-actions">
            <FileInput ref={fileInput} accept={IMAGE_TYPES.join(",")} multiple onFiles={(files) => void addFiles(files)} />
            <IconButton label="Attach images" variant="ghost" className="composer-icon" onClick={() => fileInput.current?.click()}>
              <Icon name="paperclip" />
            </IconButton>
            {running && onStop && (
              <IconButton label="Stop" title="Stop the run" className="composer-round stop" disabled={stopping} onClick={() => void attempt(onStop, setStopping)}>
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
              </IconButton>
            )}
            <IconButton type="submit" label={running ? "Steer" : "Send"} title={running ? "Send now (steers the run)" : "Send (Enter)"} variant="primary" className="composer-round send" disabled={!canSend}>
              <Icon name="arrowUp" />
            </IconButton>
          </div>
        </div>
      </div>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

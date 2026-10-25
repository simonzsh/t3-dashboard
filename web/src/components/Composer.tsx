import { useEffect, useRef, useState } from "react";
import type { DashboardProvider, ImageAttachment, ModelSelection, RuntimeMode, ThreadSettingsBody } from "../../../shared/api.ts";
import { IMAGE_TYPES, RUNTIME_MODE_LABELS, acceptImages, currentEffort, findModel, modelLabel, selectEffort, selectModel } from "../composer.ts";
import type { DropdownOption } from "../dropdown.ts";
import { NO_AUTOFILL } from "../noAutofill.ts";
import { Dropdown } from "./Dropdown.tsx";
import { Icon } from "./Icon.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";

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

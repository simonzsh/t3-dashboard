import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DashboardModel, DashboardProvider, FileEntry, ModelSelection, RuntimeMode, ThreadSettingsBody, UploadedAttachment } from "../../../../shared/api.ts";
import { RUNTIME_MODE_LABELS, acceptFiles, applyMention, attachmentType, currentEffort, findModel, isSendKey, mentionAt, selectEffort, selectModel } from "./composer.ts";
import { moveActive, type DropdownOption } from "../../lib/dropdown.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Dropdown, FileInput, Icon, IconButton, Loader, Popover, Pressable, TextArea } from "../../ui/index.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { errorMessage } from "../../lib/format.ts";
import { useAction } from "../../lib/useAction.ts";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { insertText } from "../../lib/paste.ts";

interface Attached {
  key: string;
  file: File;
  /** Object URL of an image, for the chip. */
  preview: string | null;
  state: "uploading" | "ready" | "failed";
  attachment?: UploadedAttachment;
  error?: string;
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
  /** A run is active: a sent message is queued and Stop appears. */
  running: boolean;
  /** Stop also shows with no active run, for pending background tasks. */
  stoppable?: boolean;
  draft: string;
  onDraft: (text: string) => void;
  /** Each callback throws on failure: the Composer shows the error. */
  onSend: (text: string, uploads: UploadedAttachment[]) => Promise<void>;
  /** Without it, no Stop button. */
  onStop?: () => Promise<unknown>;
  onSettings: (change: ThreadSettingsBody) => Promise<void> | void;
  placeholder?: string;
  autoFocus?: boolean;
  /** A new value focuses the message, e.g. once the parent's previous field is filled. */
  focusKey?: unknown;
  /** A new value clears the error line: the parent fixed its cause outside the Composer. */
  errorResetKey?: unknown;
  /** Send works with an empty message, e.g. when the parent adds its own text. */
  allowEmpty?: boolean;
  /** Hides the attach button and ignores pasted or dropped files, for a parent that cannot send them. */
  noImages?: boolean;
  /** Typing @ lists matching files of the thread's folder. Without it, no popup. */
  searchFiles?: (query: string) => Promise<FileEntry[]>;
}

export function Composer({ providers, selection, runtimeMode, running, stoppable = running, draft, onDraft, onSend, onStop, onSettings, placeholder, autoFocus = false, focusKey, errorResetKey, allowEmpty = false, noImages = false, searchFiles }: Props) {
  const api = useApi();
  // Picks show at once, until new values come in the props or the change fails.
  // Each field has its own override: a model reload never drops a pending mode pick, and the reverse.
  const [selectionOverride, setSelectionOverride] = useState<ModelSelection | null>(null);
  const [modeOverride, setModeOverride] = useState<RuntimeMode | null>(null);
  const [files, setFiles] = useState<Attached[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;
  const [dropping, setDropping] = useState(false);
  const [caret, setCaret] = useState(0);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [active, setActive] = useState(0);
  // The start of the mention that Escape closed: the popup stays shut for that one.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const nextCaret = useRef<number | null>(null);
  // One error line: each attempt replaces it, so an older error never hides a newer one.
  const { setError, run: attempt } = useAction("send your request");
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const touch = useMediaQuery("(pointer: coarse)");
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // Each reload gives a new selection object: compare the values.
  useEffect(() => setSelectionOverride(null), [JSON.stringify(selection)]);
  useEffect(() => setModeOverride(null), [runtimeMode]);
  const localSelection = selectionOverride ?? selection;
  const localMode = modeOverride ?? runtimeMode;
  useEffect(() => setError(null), [errorResetKey]);
  useEffect(() => {
    if (focusKey !== undefined) textarea.current?.focus();
  }, [focusKey]);

  // Grows with the text up to the CSS max height; measured again when the window resizes,
  // since a size taken while the window was narrow or hidden would stick.
  const fit = useRef(() => {});
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    fit.current = () => {
      el.style.height = "";
      if (el.value === "" || el.clientWidth === 0) return;
      el.style.height = `${el.scrollHeight}px`;
    };
    const observer = new ResizeObserver(() => fit.current());
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => fit.current(), [draft]);

  const found = findModel(providers, localSelection);
  const effort = found ? currentEffort(localSelection, found.model) : null;
  const modes = found?.provider.runtimeModes ?? (Object.keys(RUNTIME_MODE_LABELS) as RuntimeMode[]);
  const settled = files.every((f) => f.state === "ready");
  const canSend = (allowEmpty || draft.trim() !== "" || files.length > 0) && settled && !sending;

  const mention = searchFiles ? mentionAt(draft, caret) : null;
  const query = useDebouncedValue(mention ? mention.query : null, 150);
  const showMentions = mention !== null && query !== null && dismissed !== mention.start && entries.length > 0;

  useEffect(() => {
    if (!mention) setDismissed(null);
  }, [mention === null]);

  useEffect(() => {
    setActive(0);
    if (!searchFiles || query === null) return setEntries([]);
    let live = true;
    searchFiles(query).then((found) => live && setEntries(found), () => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [query]);

  // The draft is the parent's: the caret moves once the new text is in the field.
  useLayoutEffect(() => {
    if (nextCaret.current === null) return;
    textarea.current?.setSelectionRange(nextCaret.current, nextCaret.current);
    nextCaret.current = null;
  }, [draft]);

  useEffect(() => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  function pickMention(entry: FileEntry) {
    if (!mention) return;
    const next = applyMention(draft, mention, entry.path);
    nextCaret.current = next.caret;
    setCaret(next.caret);
    onDraft(next.text);
    textarea.current?.focus();
  }

  async function changeSelection(next: ModelSelection) {
    setSelectionOverride(next);
    if (!(await attempt(() => onSettings({ modelSelection: next })))) setSelectionOverride(null);
  }

  async function changeMode(next: RuntimeMode) {
    setModeOverride(next);
    if (!(await attempt(() => onSettings({ runtimeMode: next })))) setModeOverride(null);
  }

  const patch = (key: string, change: Partial<Attached>) => setFiles((current) => current.map((f) => (f.key === key ? { ...f, ...change } : f)));

  async function upload(key: string, file: File) {
    patch(key, { state: "uploading", error: undefined });
    try {
      const { attachment } = await api.uploadAttachment({ name: file.name, mimeType: file.type || "application/octet-stream", dataUrl: await readDataUrl(file) });
      // Removed while it uploaded: T3 keeps no use for it.
      if (filesRef.current.some((f) => f.key === key)) patch(key, { state: "ready", attachment });
      else void api.deleteAttachment(attachment.id).catch(() => {});
    } catch (e) {
      patch(key, { state: "failed", error: errorMessage(e) });
    }
  }

  function addFiles(picked: File[]) {
    const { accepted, error: refused } = acceptFiles(files.map((f) => f.file), picked);
    setError(refused);
    const added = accepted.map((file): Attached => ({ key: crypto.randomUUID(), file, preview: attachmentType(file) === "image" ? URL.createObjectURL(file) : null, state: "uploading" }));
    setFiles((current) => [...current, ...added]);
    for (const { key, file } of added) void upload(key, file);
  }

  function removeFile(item: Attached) {
    setFiles((current) => current.filter((f) => f.key !== item.key));
    if (item.preview) URL.revokeObjectURL(item.preview);
    if (item.attachment) void api.deleteAttachment(item.attachment.id).catch(() => {});
  }

  async function submit() {
    if (!canSend) return;
    const uploads = files.map((f) => f.attachment!);
    if (await attempt(() => onSend(draft.trim(), uploads), setSending)) {
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    }
  }

  const option = (p: DashboardProvider, m: DashboardModel, group: string): DropdownOption => ({
    id: `${p.instanceId}\u0000${m.slug}`,
    label: m.name,
    group,
    icon: <ProviderIcon provider={p.instanceId} />,
  });
  // T3's favorites come first and are not repeated in their provider's group.
  const favorites = providers
    .flatMap((p) => p.models.filter((m) => m.favorite !== null).map((m) => ({ p, m })))
    .sort((a, b) => a.m.favorite! - b.m.favorite!)
    .map(({ p, m }) => option(p, m, "Favorites"));
  const others = providers.flatMap((p) => p.models.filter((m) => m.favorite === null).map((m) => option(p, m, p.displayName)));
  const modelOptions: DropdownOption[] = [...favorites, ...others];
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
      <div
        ref={card}
        className={`composer-card${dropping ? " dropping" : ""}`}
        onDragOver={(e) => {
          if (noImages || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (noImages || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropping(false);
          addFiles([...e.dataTransfer.files]);
        }}
      >
        {files.length > 0 && (
          <ul className="composer-files" aria-label="Attachments">
            {files.map((f) => (
              <li key={f.key} className={`file-chip ${f.state}`}>
                {f.preview ? <img src={f.preview} alt="" /> : <Icon name="paperclip" />}
                <span data-tooltip={f.error ?? f.file.name} data-tooltip-clipped>{f.state === "failed" ? `${f.file.name}: failed` : f.file.name}</span>
                {f.state === "uploading" && <Loader inline label="Uploading" />}
                {f.state === "failed" && (
                  <Pressable aria-label={`Retry ${f.file.name}`} tooltip="Retry" onClick={() => void upload(f.key, f.file)}>
                    <Icon name="refresh" />
                  </Pressable>
                )}
                <Pressable aria-label={`Remove ${f.file.name}`} onClick={() => removeFile(f)}>
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
          onChange={(e) => {
            onDraft(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          enterKeyHint={touch ? "enter" : "send"}
          onKeyDown={(e) => {
            if (showMentions && !e.nativeEvent.isComposing) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                return setActive(moveActive(entries.length, active, e.key === "ArrowDown" ? 1 : -1));
              }
              if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                e.preventDefault();
                return pickMention(entries[active]!);
              }
            }
            if (isSendKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, touch)) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            const text = e.clipboardData.getData("text/plain");
            if (pasted.length === 0 && text === "") return;
            e.preventDefault();
            if (pasted.length > 0 && !noImages) addFiles(pasted);
            else onDraft(insertText(e.currentTarget, text));
          }}
          autoFocus={autoFocus}
          placeholder={placeholder ?? (running ? "Queue a message for the agent…" : "Send a message to the agent…")}
          aria-label="Message"
        />
        {showMentions && (
          <Popover anchor={card} className="mention-menu" role="listbox" matchWidth onClose={() => setDismissed(mention.start)}>
            {entries.map((entry, i) => {
              const slash = entry.path.lastIndexOf("/");
              return (
                <Pressable
                  key={entry.path}
                  role="option"
                  aria-selected={i === active}
                  className={`mention-option${i === active ? " active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pickMention(entry)}
                >
                  <span className="mention-name">{entry.path.slice(slash + 1)}{entry.kind === "directory" && "/"}</span>
                  {slash > 0 && <small className="mention-dir">{entry.path.slice(0, slash)}</small>}
                </Pressable>
              );
            })}
          </Popover>
        )}
        <div className="composer-toolbar">
          <div className="composer-pickers">
            <Dropdown
              label="Model"
              icon={localSelection ? <ProviderIcon provider={localSelection.instanceId} /> : null}
              value={selectedModelId}
              options={modelOptions}
              searchPlaceholder="Search models…"
              disabled={!localSelection}
              onPick={(id) => {
                const [instanceId, slug] = id.split("\u0000");
                const provider = providers.find((p) => p.instanceId === instanceId);
                const model = provider?.models.find((m) => m.slug === slug);
                if (provider && model) void changeSelection(selectModel(localSelection, provider, model));
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
                  onPick={(level) => void changeSelection(selectEffort(localSelection, found.model, level))}
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
              onPick={(mode) => void changeMode(mode as RuntimeMode)}
            />
          </div>
          <div className="composer-actions">
            {!noImages && (
              <>
                <FileInput ref={fileInput} multiple onFiles={addFiles} />
                <IconButton label="Attach files" tooltip="Attach files" variant="ghost" className="composer-icon" onClick={() => fileInput.current?.click()}>
                  <Icon name="paperclip" />
                </IconButton>
              </>
            )}
            {stoppable && onStop && (
              <IconButton label="Stop" tooltip={running ? "Stop the run" : "Stop background tasks"} className="composer-round stop" disabled={stopping} onClick={() => void attempt(onStop, setStopping)}>
                <Icon name="stop" />
              </IconButton>
            )}
            <IconButton type="submit" label={running ? "Queue" : "Send"} tooltip={running ? "Queue it: sent when the turn ends" : "Send"} shortcut={running ? undefined : "Enter"} variant="primary" className="composer-round send" disabled={!canSend}>
              <Icon name="arrowUp" />
            </IconButton>
          </div>
        </div>
      </div>
    </form>
  );
}

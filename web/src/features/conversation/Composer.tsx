import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComposerCommands, ContextUsage, DashboardModel, DashboardProvider, FileEntry, ModelSelection, RuntimeMode, ThreadSettingsBody, UploadedAttachment } from "../../../../shared/api.ts";
import type { StashEntry } from "../../../../shared/stash.ts";
import { STASH_LIMIT } from "../../../../shared/stash.ts";
import { RUNTIME_MODE_LABELS, acceptFiles, applyTrigger, attachmentType, composerPlaceholder, currentEffort, dropTrigger, escapeBlurs, filterCommands, filterSkills, findModel, formatTokens, isSendKey, selectEffort, selectModel, suggestsCompact, triggerAt } from "./composer.ts";
import { moveActive, type DropdownOption } from "../../lib/dropdown.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { setStash, useStash } from "../../api/stashStore.ts";
import { Button, Dropdown, FileInput, Icon, IconButton, Loader, Pressable, TextArea } from "../../ui/index.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { errorMessage } from "../../lib/format.ts";
import { useAction } from "../../lib/useAction.ts";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { insertText } from "../../lib/paste.ts";
import { StashDrawer } from "./StashDrawer.tsx";
import { isStashKey, planRestore, withStashed } from "./stash.ts";
import { mergeDraft } from "./rewind.ts";

interface Attached {
  key: string;
  name: string;
  type: string;
  size: number;
  /** Null for a file restored from the stash: T3 holds it already. */
  file: File | null;
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

/** A row of the @, / or $ menu: `insert` replaces the typed word, or `run` acts in its place. */
interface MenuItem {
  id: string;
  label: string;
  detail: string | null;
  insert: string;
  run?: "compact";
}

// The provider lists change rarely: a menu refetches them only when they are this old.
const COMMANDS_FRESH_MS = 60_000;

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

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
  /** A new `key` adds these files to the message, e.g. the attachments of a message sent back for editing. */
  restore?: { key: number; files: File[] };
  /** Typing @ lists matching files of the thread's folder. Without it, no popup. */
  searchFiles?: (query: string) => Promise<FileEntry[]>;
  /** Typing / at the start lists the provider's commands, and $ its skills. Without it, no menu and no Compact button. */
  loadCommands?: (provider: string) => Promise<ComposerCommands>;
  /** Tokens in the model's context: shown on the Compact button. */
  contextUsage?: ContextUsage | null;
  /** Compacts the context; the Compact button and /compact call it. */
  onCompact?: () => Promise<unknown>;
  /** Escape in the field, with no menu open, blurs it and calls this: the parent takes the focus for its shortcuts. */
  onEscape?: () => void;
  /** Mod+S stashes the draft, labelled with this conversation. Without it, no stash. */
  stash?: { threadId: string; title: string };
}

export function Composer({ providers, selection, runtimeMode, running, stoppable = running, draft, onDraft, onSend, onStop, onSettings, placeholder, autoFocus = false, focusKey, errorResetKey, allowEmpty = false, noImages = false, restore, searchFiles, loadCommands, contextUsage = null, onCompact, onEscape, stash }: Props) {
  const api = useApi();
  // Picks show at once, until new values come in the props or the change fails.
  // Each field has its own override: a model reload never drops a pending mode pick, and the reverse.
  const [selectionOverride, setSelectionOverride] = useState<ModelSelection | null>(null);
  const [modeOverride, setModeOverride] = useState<RuntimeMode | null>(null);
  const [files, setFiles] = useState<Attached[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;
  // Keys of the files a message took: they belong to T3 now.
  const sentKeys = useRef(new Set<string>());
  const [dropping, setDropping] = useState(false);
  const [caret, setCaret] = useState(0);
  const [available, setAvailable] = useState<{ provider: string; at: number; value: ComposerCommands } | null>(null);
  const [compacting, setCompacting] = useState(false);
  const stashed = useStash();
  const [stashOpen, setStashOpen] = useState(false);
  // The last entry gone: close the list so the next stash does not reopen it.
  useEffect(() => {
    if (stashed.length === 0) setStashOpen(false);
  }, [stashed.length]);
  const [stashing, setStashing] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // The results carry the query they answer: a slower or older answer never shows for a newer mention.
  const [results, setResults] = useState<{ query: string; entries: FileEntry[] }>({ query: "", entries: [] });
  const [active, setActive] = useState(0);
  // The start of the word that Escape closed: the popup stays shut for that one.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const menuBox = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
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
  const driver = providers.find((p) => p.instanceId === localSelection?.instanceId)?.driver;
  // The prompt cache expires with time: look again every minute, like T3 Code.
  const [minute, setMinute] = useState(() => Date.now());
  const nearCompact = (contextUsage?.usedTokens ?? 0) >= 200_000;
  useEffect(() => {
    if (!nearCompact) return;
    const id = setInterval(() => setMinute(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [nearCompact]);
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

  const trigger = triggerAt(draft, caret);
  const mention = searchFiles && trigger?.kind === "mention" ? trigger : null;
  const menuKind = trigger && (trigger.kind === "mention" ? mention : loadCommands) ? trigger.kind : null;
  const query = useDebouncedValue(mention ? mention.query : null, 150);
  const entries = mention !== null && results.query === mention.query ? results.entries : [];
  const provider = localSelection?.instanceId ?? null;
  const lists = available && available.provider === provider ? available.value : null;
  const compactable = lists?.commands.some((command) => command.name === "compact") ?? false;

  const items: MenuItem[] =
    menuKind === "mention"
      ? entries.map((entry) => {
          const slash = entry.path.lastIndexOf("/");
          return { id: entry.path, label: `${entry.path.slice(slash + 1)}${entry.kind === "directory" ? "/" : ""}`, detail: slash > 0 ? entry.path.slice(0, slash) : null, insert: `@${entry.path}` };
        })
      : menuKind === "command" && lists
        ? filterCommands(lists.commands, trigger!.query, { compact: !running }).map((command) => ({
            id: command.name,
            label: `/${command.name}`,
            detail: command.description ?? command.hint ?? null,
            insert: `/${command.name}`,
            ...(command.name === "compact" && onCompact && { run: "compact" as const }),
          }))
        : menuKind === "skill" && lists
          ? filterSkills(lists.skills, trigger!.query).map((skill) => ({ id: skill.name, label: `$${skill.name}`, detail: skill.description ?? skill.displayName, insert: `$${skill.name}` }))
          : [];
  const showMenu = trigger !== null && menuKind !== null && (menuKind !== "mention" || query !== null) && dismissed !== trigger.start && items.length > 0;
  const wantsLists = menuKind === "command" || menuKind === "skill";
  // The menu shows while the field has the focus: a tap or click elsewhere hides it.
  const menuOpen = showMenu && focused;
  // In the card, under CSS: it stays against the field, keyboard up or not. Only its height is measured.
  useLayoutEffect(() => {
    const box = menuBox.current;
    const top = card.current?.getBoundingClientRect().top;
    if (!box || top === undefined) return;
    const frame = card.current!.closest(".desk-window")?.getBoundingClientRect().top ?? 0;
    box.style.maxHeight = `${Math.max(96, Math.min(260, top - frame - 12))}px`;
  });

  useEffect(() => {
    if (!trigger) setDismissed(null);
  }, [trigger === null]);

  useEffect(() => {
    if (!loadCommands || !provider) return;
    if (available?.provider === provider && (!wantsLists || Date.now() - available.at < COMMANDS_FRESH_MS)) return;
    let live = true;
    loadCommands(provider).then((value) => live && setAvailable({ provider, at: Date.now(), value }), () => {});
    return () => {
      live = false;
    };
  }, [provider, wantsLists]);

  useEffect(() => setActive(0), [trigger?.kind, trigger?.query]);

  useEffect(() => {
    if (!searchFiles || query === null) return setResults({ query: "", entries: [] });
    let live = true;
    searchFiles(query).then((found) => live && setResults({ query, entries: found }), () => live && setResults({ query, entries: [] }));
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

  const reloadStash = () => api.getStash().then((r) => setStash(r.entries), () => {});
  useEffect(() => {
    if (stash) void reloadStash();
  }, [stash === undefined]);

  useEffect(() => {
    if (restore?.files.length) addFiles(restore.files);
  }, [restore?.key]);

  // Closing the composer with files never sent frees them in T3.
  useEffect(
    () => () =>
      filesRef.current.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
        if (f.attachment && !sentKeys.current.has(f.key)) void api.deleteAttachment(f.attachment.id).catch(() => {});
      }),
    [],
  );

  const compact = () => attempt(onCompact!, setCompacting);

  function pick(item: MenuItem) {
    if (!trigger) return;
    // Like T3 Code: /compact runs at once and leaves no text behind.
    const runs = item.run === "compact" && onCompact !== undefined;
    const next = runs ? dropTrigger(draft, trigger) : applyTrigger(draft, trigger, item.insert);
    nextCaret.current = next.caret;
    setCaret(next.caret);
    onDraft(next.text);
    textarea.current?.focus();
    if (runs) void compact();
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
    const { accepted, error: refused } = acceptFiles(files, picked);
    setError(refused);
    const added = accepted.map((file): Attached => ({ key: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, file, preview: attachmentType(file) === "image" ? URL.createObjectURL(file) : null, state: "uploading" }));
    setFiles((current) => [...current, ...added]);
    for (const { key, file } of added) if (file) void upload(key, file);
  }

  const free = (uploads: UploadedAttachment[]) => uploads.forEach((u) => void api.deleteAttachment(u.id).catch(() => {}));

  // The files move to the stash entry: they belong to it now, not to this composer.
  async function stashDraft() {
    if (!stash || (draft.trim() === "" && files.length === 0)) return;
    if (!settled) return setError("Wait for the uploads to finish before stashing this prompt.");
    const sent = await attempt(async () => {
      const { entry, evicted } = await api.createStash({ text: draft, uploads: files.map((f) => f.attachment!), threadId: stash.threadId, threadTitle: stash.title });
      setStash((list) => withStashed(list, entry));
      evicted.forEach((e) => free(e.uploads));
      if (evicted.length > 0) setError(`The stash holds ${STASH_LIMIT} prompts; the oldest was removed to make room.`);
    }, setStashing);
    if (!sent) return;
    files.forEach((f) => sentKeys.current.add(f.key));
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    onDraft("");
  }

  // Like T3 Code: the entry leaves the stash first, so a second device cannot restore it twice.
  async function restoreStash(entry: StashEntry) {
    if (!(await attempt(() => api.deleteStash(entry.id)))) return void reloadStash();
    const { uploads, notes } = planRestore(entry, filesRef.current.length, new Date());
    setStash((list) => list.filter((e) => e.id !== entry.id));
    setStashOpen(false);
    onDraft(mergeDraft(draftRef.current, entry.text));
    setFiles((current) => [...current, ...uploads.map((attachment): Attached => ({ key: crypto.randomUUID(), name: attachment.name, type: attachment.mimeType, size: attachment.sizeBytes, file: null, preview: null, state: "ready", attachment }))]);
    if (notes.length > 0) setError(notes.join(" "));
    textarea.current?.focus();
  }

  async function deleteStash(entry: StashEntry) {
    if (!(await attempt(() => api.deleteStash(entry.id)))) return void reloadStash();
    free(entry.uploads);
    setStash((list) => list.filter((e) => e.id !== entry.id));
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
      files.forEach((f) => sentKeys.current.add(f.key));
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
      onKeyDown={(e) => {
        // Also stops the browser's "save page".
        if (!stash || !isStashKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, isMac)) return;
        e.preventDefault();
        if (!stashing) void stashDraft();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div
        ref={card}
        className={`composer-card${dropping ? " dropping" : ""}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          // Always cancelled: a dropped file must not make the browser leave the page.
          e.preventDefault();
          if (!noImages) setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          if (noImages) return;
          setDropping(false);
          addFiles([...e.dataTransfer.files]);
        }}
      >
        {files.length > 0 && (
          <ul className="composer-files" aria-label="Attachments">
            {files.map((f) => (
              <li key={f.key} className={`file-chip ${f.state}`}>
                {f.preview ? <img src={f.preview} alt="" /> : <Icon name="paperclip" />}
                <span data-tooltip={f.error ?? f.name} data-tooltip-clipped>{f.state === "failed" ? `${f.name}: failed` : f.name}</span>
                {f.state === "uploading" && <Loader inline label="Uploading" />}
                {f.state === "failed" && f.file && (
                  <Pressable aria-label={`Retry ${f.name}`} tooltip="Retry" onClick={() => void upload(f.key, f.file!)}>
                    <Icon name="refresh" />
                  </Pressable>
                )}
                <Pressable aria-label={`Remove ${f.name}`} onClick={() => removeFile(f)}>
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
            if (menuOpen && !e.nativeEvent.isComposing) {
              if (e.key === "Escape") {
                // Stop here: a dialog or the desk must not also react to this Escape.
                e.preventDefault();
                e.stopPropagation();
                return setDismissed(trigger!.start);
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                return setActive(moveActive(items.length, active, e.key === "ArrowDown" ? 1 : -1));
              }
              if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                e.preventDefault();
                return pick(items[active]!);
              }
            }
            if (onEscape && escapeBlurs({ key: e.key, isComposing: e.nativeEvent.isComposing }, menuOpen)) {
              e.currentTarget.blur();
              return onEscape();
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
          onFocus={() => {
            clearTimeout(blurTimer.current);
            setFocused(true);
          }}
          // A tap on an option may blur the field before its click: hide the menu a moment later.
          onBlur={() => {
            blurTimer.current = setTimeout(() => setFocused(false), 200);
          }}
          autoFocus={autoFocus}
          placeholder={placeholder ?? composerPlaceholder(running, [...(searchFiles ? ["@ files"] : []), ...(loadCommands ? ["$ skills", "/ commands"] : [])])}
          aria-label="Message"
        />
        {menuOpen && (
          <div ref={menuBox} className="mention-menu composer-menu" role="listbox">
            {items.map((item, i) => (
              <Pressable
                key={item.id}
                role="option"
                aria-selected={i === active}
                className={`mention-option${i === active ? " active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item)}
              >
                <span className="mention-name">{item.label}</span>
                {item.detail && <small className={`mention-dir${menuKind === "mention" ? " path" : ""}`}>{item.detail}</small>}
              </Pressable>
            ))}
          </div>
        )}
        {stashOpen && stashed.length > 0 && <StashDrawer anchor={card} entries={stashed} onRestore={(e) => void restoreStash(e)} onDelete={(e) => void deleteStash(e)} onClose={() => setStashOpen(false)} />}
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
            {/* No Ctrl+S on a touch screen: this button stashes instead. */}
            {stash && touch && (draft.trim() !== "" || files.length > 0) && (
              <IconButton label="Stash this prompt" tooltip="Stash this prompt" variant="ghost" className="composer-icon" disabled={stashing} onClick={() => void stashDraft()}>
                <Icon name="stashIn" />
              </IconButton>
            )}
            {stash && stashed.length > 0 && (
              <Button size="sm" variant="ghost" className="composer-stash" aria-expanded={stashOpen} aria-label={`Stashed prompts: ${stashed.length}. Open stash.`} tooltip="Stashed prompts" onClick={() => setStashOpen((open) => !open)}>
                <Icon name="archive" /> Stash <span className="stash-count">{stashed.length}</span>
              </Button>
            )}
            {!noImages && (
              <>
                <FileInput ref={fileInput} multiple onFiles={addFiles} />
                <IconButton label="Attach files" tooltip="Attach files" variant="ghost" className="composer-icon" onClick={() => fileInput.current?.click()}>
                  <Icon name="paperclip" />
                </IconButton>
              </>
            )}
            {onCompact && compactable && contextUsage && !running && suggestsCompact(driver, contextUsage, minute) && (
              <Button
                size="sm"
                variant="ghost"
                className="composer-compact"
                disabled={running}
                loading={compacting}
                tooltip={`Compact the context: ${contextUsage.usedTokens.toLocaleString("en-US")} tokens`}
                onClick={() => void compact()}
              >
                Compact <span className="compact-tokens">{formatTokens(contextUsage.usedTokens)}</span>
              </Button>
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

import { useState } from "react";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { Dialog, TextInput } from "../../ui/index.ts";

export function RenameSessionDialog({ id, title: initialTitle, onClose, onRenamed }: { id: string; title: string; onClose: () => void; onRenamed?: (title: string) => void }) {
  const api = useApi();
  const [title, setTitle] = useState(initialTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = title.trim().length > 0 && title.trim().length <= 200;
  async function submit() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.renameThread(id, title.trim());
      onRenamed?.(title.trim());
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const close = () => { if (!busy) onClose(); };
  return <Dialog title="Rename session" onClose={close} onCancel={close} primary={{ label: busy ? "Saving…" : "Save", disabled: busy || !valid, onClick: () => void submit() }}>
    <label className="dialog-field">
      <span>Title</span>
      <TextInput autoFocus value={title} maxLength={200} disabled={busy} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
      }} />
    </label>
    {error && <p className="auto-error" role="alert">{error}</p>}
  </Dialog>;
}

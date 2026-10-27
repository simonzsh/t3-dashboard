import { useState } from "react";
import type { Automation } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { Dialog, TextInput } from "../../ui/index.ts";

interface Props {
  automation: Automation;
  onRenamed: () => void;
  onClose: () => void;
}

export function RenameAutomationDialog({ automation, onRenamed, onClose }: Props) {
  const api = useApi();
  const [title, setTitle] = useState(automation.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || title.trim() === "";

  async function submit() {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      await api.renameAutomation(automation.id, title.trim());
      onRenamed();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Rename automation" onClose={onClose} onCancel={onClose} primary={{ label: busy ? "Renaming…" : "Rename", onClick: () => void submit(), disabled }}>
      <TextInput
        aria-label="Title"
        autoFocus
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {error && <p className="notice error-notice">{error}</p>}
    </Dialog>
  );
}

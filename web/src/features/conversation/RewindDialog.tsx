import { useState } from "react";
import type { ChatMessage } from "../../../../shared/api.ts";
import { Choice, Dialog } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

interface Props {
  message: ChatMessage;
  onClose: () => void;
  /** Rewinds, then puts the message back in the composer. A failure throws and the dialog stays open. */
  onConfirm: (message: ChatMessage, restoreFiles: boolean) => Promise<void>;
}

export function RewindDialog({ message, onClose, onConfirm }: Props) {
  const [restoreFiles, setRestoreFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = useAction("edit from here");

  async function confirm() {
    if (await action.run(() => onConfirm(message, restoreFiles), setBusy)) onClose();
  }

  return (
    <Dialog title="Edit from here?" onClose={onClose} onCancel={onClose} primary={{ label: "Edit from here", onClick: () => void confirm(), disabled: busy }}>
      <p>Rewind chat to before this message. Your prompt and attachments return to the composer. “Revert files too” also undoes your own edits.</p>
      <label className="rewind-files">
        <Choice type="checkbox" checked={restoreFiles} disabled={busy} onChange={(e) => setRestoreFiles(e.target.checked)} />
        Revert files too
      </label>
    </Dialog>
  );
}

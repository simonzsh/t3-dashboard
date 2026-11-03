import { useState } from "react";
import type { ChatMessage } from "../../../../shared/api.ts";
import { Dialog } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";

interface Props {
  message: ChatMessage;
  onClose: () => void;
  /** Rewinds, then puts the message back in the composer. A failure throws and the dialog stays open. */
  onConfirm: (message: ChatMessage, restoreFiles: boolean) => Promise<void>;
}

export function RewindDialog({ message, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const action = useAction("edit from here");

  async function confirm(restoreFiles: boolean) {
    if (await action.run(() => onConfirm(message, restoreFiles), setBusy)) onClose();
  }

  return (
    <Dialog
      title="Edit from here?"
      onClose={onClose}
      onCancel={onClose}
      secondary={{ label: "Revert and keep changes", onClick: () => void confirm(false), disabled: busy }}
      primary={{ label: "Revert files too", onClick: () => void confirm(true), disabled: busy }}
    >
      <p>Rewind chat to before this message. Your prompt and attachments return to the composer. “Revert files too” also undoes your own edits; “Revert and keep changes” leaves your files as they are.</p>
    </Dialog>
  );
}

import type { ChatMessage } from "../../../../shared/api.ts";
import { Icon, IconButton } from "../../ui/index.ts";
import { useCopy } from "../../lib/useCopy.ts";

interface Props {
  message: ChatMessage;
  /** Opens the "Edit from here" dialog. Without it, or for a message T3 cannot rewind to, no button. */
  onEdit?: (message: ChatMessage) => void;
  /** The thread is working: T3 refuses a rewind. */
  editDisabled: boolean;
}

export function MessageActions({ message, onEdit, editDisabled }: Props) {
  const { copied, copy } = useCopy("copy the message");

  return (
    <span className="msg-actions">
      {message.text && (
        <IconButton label="Copy message" tooltip="Copy message" size="sm" variant="ghost" onClick={() => copy(message.text)}>
          <Icon name={copied ? "check" : "copy"} />
        </IconButton>
      )}
      {copied && (
        <span className="msg-copied" role="status">
          Copied
        </span>
      )}
      {onEdit && message.role === "user" && message.rewindable && (
        <IconButton label="Edit from here" tooltip={editDisabled ? "Stop the run to edit from here" : "Edit from here"} size="sm" variant="ghost" disabled={editDisabled} onClick={() => onEdit(message)}>
          <Icon name="undo" />
        </IconButton>
      )}
    </span>
  );
}

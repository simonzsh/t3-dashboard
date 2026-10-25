import type { UpdateStatus } from "../../../shared/api.ts";
import { Dialog } from "../ui/index.ts";
import { updateQuestion } from "../updateFlow.ts";

interface Props {
  status: UpdateStatus;
  onConfirm: () => void;
  onClose: () => void;
}

export function UpdateDialog({ status, onConfirm, onClose }: Props) {
  return (
    <Dialog title={updateQuestion(status)} label="Update" onClose={onClose} onCancel={onClose} primary={{ label: "Update", onClick: onConfirm }}>
      <p>The dashboard restarts for a few seconds.</p>
    </Dialog>
  );
}

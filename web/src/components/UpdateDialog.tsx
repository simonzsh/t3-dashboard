import type { UpdateStatus } from "../../../shared/api.ts";
import { updateQuestion } from "../updateFlow.ts";
import { useEscape } from "./useEscape.ts";

interface Props {
  status: UpdateStatus;
  onConfirm: () => void;
  onClose: () => void;
}

export function UpdateDialog({ status, onConfirm, onClose }: Props) {
  useEscape(onClose);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Update" onClick={(e) => e.stopPropagation()}>
        <h2>{updateQuestion(status)}</h2>
        <p>The dashboard restarts for a few seconds.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            Update
          </button>
        </div>
      </div>
    </div>
  );
}

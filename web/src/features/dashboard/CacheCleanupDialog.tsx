import type { CacheCleanupPreview } from "../../../../shared/api.ts";
import { Dialog } from "../../ui/index.ts";
import { formatSize } from "./serverView.ts";

interface Props {
  /** Null while the sizes are measured. */
  preview: CacheCleanupPreview | null;
  error: string | null;
  running: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function CacheCleanupDialog({ preview, error, running, onConfirm, onClose }: Props) {
  const empty = !preview || preview.totalBytes === 0;
  return (
    <Dialog
      title="Clear caches"
      className="cache-cleanup"
      onClose={onClose}
      onCancel={onClose}
      primary={{ label: running ? "Clearing…" : "Clear caches", onClick: onConfirm, disabled: empty || running, danger: true }}
    >
      <p className="hint">These caches are rebuilt when needed. Temp folders keep anything changed in the last hour. Nothing else is touched.</p>
      {preview ? (
        <ul className="cache-list">
          {preview.targets.map((target) => (
            <li key={target.id}>
              <span>{target.label}</span>
              <span className="cache-size">{formatSize(target.bytes)}</span>
            </li>
          ))}
          <li className="cache-total">
            <span>Total</span>
            <span className="cache-size">{formatSize(preview.totalBytes)}</span>
          </li>
        </ul>
      ) : (
        !error && <p className="hint" role="status">Measuring…</p>
      )}
      {running && <p className="hint" role="status">Clearing…</p>}
      {error && <p className="auto-error" role="alert">{error}</p>}
    </Dialog>
  );
}

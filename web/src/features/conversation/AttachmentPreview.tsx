import { Dialog } from "../../ui/index.ts";
import type { PreviewTarget } from "./attachmentPreview.ts";

// Only an HTML page runs scripts, sandboxed without same-origin like a render: it cannot reach the dashboard API.
export function AttachmentPreview({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  return (
    <Dialog title={target.name} onClose={onClose} className="preview-dialog">
      <div className="preview-body">
        {target.kind === "image" ? (
          <img src={target.src} alt={target.name} />
        ) : (
          <iframe title={target.name} src={target.src} sandbox={target.kind === "html" ? "allow-scripts allow-popups" : undefined} />
        )}
      </div>
      <div className="preview-actions">
        <a className="btn md" href={target.download} download={target.name}>
          Download
        </a>
        <a className="btn md" href={target.open} target="_blank" rel="noreferrer">
          Open in new tab
        </a>
      </div>
    </Dialog>
  );
}

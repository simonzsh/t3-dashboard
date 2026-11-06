import { createPortal } from "react-dom";
import { Dialog } from "../../ui/index.ts";
import type { PreviewTarget } from "./attachmentPreview.ts";

type Props = { target: PreviewTarget; onClose: () => void };

// Portal: a session panel makes a stacking context, so the app header would cover the tall dialog.
export function AttachmentPreview(props: Props) {
  return createPortal(<PreviewDialog {...props} />, document.body);
}

// Only an HTML page runs scripts, sandboxed without same-origin like a render: it cannot reach the dashboard API.
export function PreviewDialog({ target, onClose }: Props) {
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

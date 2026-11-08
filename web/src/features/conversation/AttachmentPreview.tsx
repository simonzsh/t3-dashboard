import { ButtonLink, Dialog } from "../../ui/index.ts";
import type { PreviewTarget } from "./attachmentPreview.ts";

type Props = { target: PreviewTarget; onClose: () => void };

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
        <ButtonLink href={target.download} download={target.name}>
          Download
        </ButtonLink>
        <ButtonLink href={target.open} target="_blank" rel="noreferrer">
          Open in new tab
        </ButtonLink>
      </div>
    </Dialog>
  );
}

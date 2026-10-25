import { versionNote } from "../updateFlow.ts";
import type { UpdateControl } from "../useUpdate.ts";

interface Props {
  update: UpdateControl;
  onUpdate: () => void;
}

export function AboutSettings({ update, onUpdate }: Props) {
  const { status } = update;
  if (!status) return <p className="empty">Loading…</p>;
  return (
    <>
      <div className="settings-row">
        <span>Installed version</span>
        <code className="key-mask">{status.current}</code>
      </div>
      <div className="settings-row">
        <span>Latest version</span>
        <code className="key-mask">{status.latest ?? "unknown"}</code>
      </div>
      <p className="empty">{versionNote(status)}</p>
      {status.reason && status.current !== "dev" && <p className="empty">{status.reason}</p>}
      <div className="buttons">
        <button type="button" disabled={update.checking || update.updating} onClick={() => void update.check()}>
          {update.checking ? "Checking…" : "Check for updates"}
        </button>
        {status.available && status.canUpdate && (
          <button type="button" className="primary" disabled={update.updating} onClick={onUpdate}>
            {update.updating ? "Updating…" : `Update to v${status.latest}`}
          </button>
        )}
      </div>
      {update.error && <span className="error">{update.error}</span>}
    </>
  );
}

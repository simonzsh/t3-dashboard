import { useState } from "react";
import { versionNote } from "../updateFlow.ts";
import type { UpdateControl } from "../useUpdate.ts";

interface Props {
  update: UpdateControl;
  onUpdate: () => void;
}

export function AboutSettings({ update, onUpdate }: Props) {
  const { status } = update;
  // The automatic checks stay silent: a note shows only after a click.
  const [checked, setChecked] = useState(false);
  if (!status) return <p className="empty">Loading…</p>;
  const canUpdate = status.available && status.canUpdate;
  return (
    <>
      <div className="settings-row">
        <span className="version-line">
          Version <code className="key-mask">{status.current}</code>
        </span>
        {canUpdate ? (
          <button type="button" className="primary" disabled={update.updating} onClick={onUpdate}>
            {update.updating ? "Updating…" : `Update to v${status.latest}`}
          </button>
        ) : (
          <button
            type="button"
            disabled={update.checking || update.updating}
            onClick={async () => {
              await update.check();
              setChecked(true);
            }}
          >
            {update.checking ? "Checking…" : "Check for updates"}
          </button>
        )}
      </div>
      {update.error ? (
        <span className="error settings-note">{update.error}</span>
      ) : (
        checked && !canUpdate && <small className="settings-note">{status.reason && status.current !== "dev" ? status.reason : versionNote(status)}</small>
      )}
    </>
  );
}

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
        <span className="row-icons">
          <button
            type="button"
            className={`icon-button${update.checking ? " spinning" : ""}`}
            aria-label="Check for updates"
            title="Check for updates"
            disabled={update.checking || update.updating}
            onClick={async () => {
              await update.check();
              setChecked(true);
            }}
          >
            {/* Lucide refresh-cw (ISC). */}
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {canUpdate && (
            <button type="button" className="primary" disabled={update.updating} onClick={onUpdate}>
              {update.updating ? "Updating…" : `Update to v${status.latest}`}
            </button>
          )}
        </span>
      </div>
      {update.error ? (
        <span className="error settings-note">{update.error}</span>
      ) : (
        checked && !canUpdate && <small className="settings-note">{status.reason && status.current !== "dev" ? status.reason : versionNote(status)}</small>
      )}
    </>
  );
}

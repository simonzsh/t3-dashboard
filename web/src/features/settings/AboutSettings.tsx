import { useState } from "react";
import { versionNote } from "../update/updateFlow.ts";
import { Button, Icon, IconButton } from "../../ui/index.ts";
import type { UpdateControl } from "../update/useUpdate.ts";

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
          {update.error ? (
            <span className="error about-note">{update.error}</span>
          ) : (
            checked && !canUpdate && <small className="about-note">{status.reason && status.current !== "dev" ? status.reason : versionNote(status)}</small>
          )}
          <IconButton
            label="Check for updates"
            size="sm"
            className={update.checking ? "spinning" : undefined}
            disabled={update.checking || update.updating}
            onClick={async () => {
              await update.check();
              setChecked(true);
            }}
          >
            <Icon name="refresh" strokeWidth={1.8} />
          </IconButton>
          {canUpdate && (
            <Button variant="primary" size="sm" loading={update.updating && "Updating…"} onClick={onUpdate}>
              {`Update to v${status.latest}`}
            </Button>
          )}
        </span>
      </div>
    </>
  );
}

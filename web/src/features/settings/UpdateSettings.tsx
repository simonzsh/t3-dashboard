import { useState } from "react";
import { versionNote } from "../update/updateFlow.ts";
import { Button, Icon, IconButton, Loader } from "../../ui/index.ts";
import type { UpdateControl } from "../update/useUpdate.ts";

interface Props {
  update: UpdateControl;
  onUpdate: () => void;
}

export function UpdateSettings({ update, onUpdate }: Props) {
  const { status } = update;
  // The automatic checks stay silent: a note shows only after a click.
  const [checked, setChecked] = useState(false);
  if (!status) return <Loader />;
  const canUpdate = status.available && status.canUpdate;
  return (
    <>
      <div className="settings-row">
        <span>Version</span>
        <span className="row-icons">
          <code className="key-mask">{status.current}</code>
          <IconButton
            label="Check for updates"
            tooltip="Check for updates"
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
          {update.error ? (
            <span className="error about-note">{update.error}</span>
          ) : (
            checked && !canUpdate && <small className="about-note">{status.reason && status.current !== "dev" ? status.reason : versionNote(status)}</small>
          )}
        </span>
      </div>
    </>
  );
}

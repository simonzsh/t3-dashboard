import { useState } from "react";
import { updateTargetLabel, versionNote } from "../update/updateFlow.ts";
import { displayVersion } from "../../../../shared/updates.ts";
import { Button, Icon, IconButton, Loader, Segmented } from "../../ui/index.ts";
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
        <span>Update channel</span>
        <Segmented label="Update channel" value={status.channel} options={[{ id: "stable", label: "Stable" }, { id: "main", label: "Main" }]} disabled={update.checking || update.updating || status.updating} onChange={channel => void update.setChannel(channel)} />
        <small className="about-note">Stable releases or the latest main build. Updates stay manual.</small>
      </div>
      <div className="settings-row">
        <span>Version</span>
        <span className="row-icons">
          <code className="key-mask">{displayVersion(status.current)}</code>
          <IconButton
            label="Check for updates"
            tooltip="Check for updates"
            size="sm"
            aria-busy={update.checking}
            disabled={update.checking || update.updating}
            onClick={async () => {
              await update.check();
              setChecked(true);
            }}
          >
            <Icon name="refresh" strokeWidth={1.8} className={update.checking ? "icon spinning" : "icon"} />
          </IconButton>
          {canUpdate && (
            <Button variant="primary" size="sm" loading={update.updating && "Updating…"} onClick={onUpdate}>
              {updateTargetLabel(status)}
            </Button>
          )}
          {checked && !canUpdate && <small className="about-note">{status.reason && status.current !== "dev" ? status.reason : versionNote(status)}</small>}
        </span>
      </div>
    </>
  );
}

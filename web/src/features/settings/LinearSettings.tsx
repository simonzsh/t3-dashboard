import { useEffect, useState } from "react";
import type { SettingsResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { KEY_PATH, KEY_URL, maskedKey } from "./linearSettings.ts";
import { Icon, IconButton, Loader } from "../../ui/index.ts";
import { LinearKeyForm } from "./LinearKeyForm.tsx";
import { useAction } from "../../lib/useAction.ts";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";

interface Props {
  onChange: () => void;
}

export function LinearSettings({ onChange }: Props) {
  const api = useApi();
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [changing, setChanging] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const notify = useNotify();
  const action = useAction("disconnect Linear");

  useEffect(() => {
    api.getSettings().then(setSettings, (e: unknown) => {
      setLoadError(true);
      notify(failure("load the Linear settings", e));
    });
  }, []);

  function saved(next: SettingsResult) {
    setSettings(next);
    setChanging(false);
    onChange();
  }

  if (!settings) return loadError ? <p className="empty">The Linear settings could not be loaded.</p> : <Loader />;
  const { linear } = settings;

  return (
    <>
      <div className="settings-row">
        <span>Linear</span>
        <span className="linear-controls">
          {linear.connected ? (
            <span className="linear-status">
              <span className="conn up">
                <span className="conn-dot" /> Connected
              </span>
              {linear.keyTail && <code className="key-mask">{maskedKey(linear.keyTail)}</code>}
            </span>
          ) : (
            <span className="linear-status muted">Not connected</span>
          )}
          {linear.connected && (
            <span className="row-icons">
              <IconButton label="Change key" tooltip="Change key" size="sm" aria-expanded={changing} onClick={() => setChanging(!changing)}>
                <Icon name="pencil" strokeWidth={1.8} />
              </IconButton>
              <IconButton
                label="Disconnect"
                tooltip="Disconnect"
                size="sm"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    saved(await api.disconnectLinear());
                  })
                }
              >
                <Icon name="logOut" strokeWidth={1.8} />
              </IconButton>
            </span>
          )}
        </span>
      </div>
      {(!linear.connected || changing) && (
        <div className="key-box">
          <small>
            Create a key in Linear under {KEY_PATH.slice(0, 3).join(" → ")}.{" "}
            <a href={KEY_URL} target="_blank" rel="noreferrer">
              Open the page
            </a>
          </small>
          <LinearKeyForm button={linear.connected ? "Save key" : "Connect"} onSaved={saved} />
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import type { SettingsResult } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { KEY_URL, maskedKey } from "../linearSettings.ts";
import { LinearKeyForm } from "./LinearKeyForm.tsx";
import { useAction } from "./useAction.ts";

interface Props {
  onChange: () => void;
}

// Icon paths from Lucide (ISC): pencil and log-out.
const Icon = ({ d }: { d: string }) => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function LinearSettings({ onChange }: Props) {
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [changing, setChanging] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    api.getSettings().then(setSettings, (e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  function saved(next: SettingsResult) {
    setSettings(next);
    setChanging(false);
    onChange();
  }

  if (!settings) return <p className="empty">{loadError ?? "Loading…"}</p>;
  const { linear } = settings;

  return (
    <>
      <div className="settings-row">
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
            <button type="button" className="icon-button" aria-label="Change key" title="Change key" aria-expanded={changing} onClick={() => setChanging(!changing)}>
              <Icon d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Disconnect"
              title="Disconnect"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  saved(await api.disconnectLinear());
                })
              }
            >
              <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </button>
          </span>
        )}
      </div>
      {(!linear.connected || changing) && (
        <div className="key-box">
          <small>
            Create a key in Linear under Settings → Account → Security &amp; access.{" "}
            <a href={KEY_URL} target="_blank" rel="noreferrer">
              Open the page
            </a>
          </small>
          <LinearKeyForm button={linear.connected ? "Save key" : "Connect"} onSaved={saved} />
        </div>
      )}
      {linear.legacy && <p className="notice">Your Linear file uses the old workspaces list. The next save keeps only the first workspace that has a key.</p>}
      {action.error && <span className="error">{action.error}</span>}
    </>
  );
}

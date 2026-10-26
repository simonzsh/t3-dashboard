import { useSyncExternalStore } from "react";
import { Button } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { detectBrowser, INSTALL_NOTES, installView } from "./install.ts";
import { installState, promptInstall, subscribeInstall } from "./installPrompt.ts";

export function InstallSettings() {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, installState);
  const standalone = useMediaQuery("(display-mode: standalone)");
  const { busy, error, run } = useAction();
  const view = installView({ standalone, installed, canPrompt, browser: detectBrowser(navigator.userAgent) });

  return (
    <div className="settings-row settings-row-top">
      <span>Install as an app</span>
      <div className="install-choice">
        {view === "prompt" && (
          <Button variant="primary" loading={busy && "Installing…"} onClick={() => run(promptInstall)}>
            Install
          </Button>
        )}
        {view !== "prompt" && <p className="settings-note">{INSTALL_NOTES[view]}</p>}
        {view === "chromium" && !window.isSecureContext && <p className="settings-note error">This page needs HTTPS or localhost to be installable.</p>}
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

import { useSyncExternalStore } from "react";
import { Button } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { detectBrowser, installSteps, installView, isMac, type InstallView } from "./install.ts";
import { installState, promptInstall, subscribeInstall } from "./installPrompt.ts";

export function InstallSettings() {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, installState);
  const standalone = useMediaQuery("(display-mode: standalone)");
  const { busy, error, run } = useAction();
  const view = installView({ standalone, installed, canPrompt, browser: detectBrowser(navigator.userAgent, navigator.maxTouchPoints) });

  return (
    <div className="settings-row">
      <span>Install as an app</span>
      {view === "prompt" ? (
        <Button variant="primary" loading={busy && "Installing…"} onClick={() => run(promptInstall)}>
          Install
        </Button>
      ) : (
        <InstallSteps view={view} />
      )}
      {view === "chromium" && !window.isSecureContext && <p className="install-steps error">This page needs HTTPS or localhost to be installable.</p>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

/** Numbered only when they are taps to follow in order; elsewhere they are plain advice. */
function InstallSteps({ view }: { view: Exclude<InstallView, "prompt"> }) {
  const steps = installSteps(view, isMac(navigator.userAgent));
  return view === "ios" || view === "android" ? (
    <ol className="install-steps">
      {steps.map((s) => <li key={s}>{s}</li>)}
    </ol>
  ) : (
    <div className="install-steps">
      {steps.map((s) => <p key={s}>{s}</p>)}
    </div>
  );
}

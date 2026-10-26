import { useSyncExternalStore } from "react";
import { Button } from "../../ui/index.ts";
import { useAction } from "../../lib/useAction.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { detectBrowser, installSteps, installView, isMac } from "./install.ts";
import { installState, promptInstall, subscribeInstall } from "./installPrompt.ts";

export function InstallSettings() {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, installState);
  const standalone = useMediaQuery("(display-mode: standalone)");
  const { busy, error, run } = useAction();
  const view = installView({ standalone, installed, canPrompt, browser: detectBrowser(navigator.userAgent, navigator.maxTouchPoints) });

  return (
    <div className="install-section">
      <span className="install-title">Install as an app</span>
      {view === "prompt" ? (
        <Button variant="primary" loading={busy && "Installing…"} onClick={() => run(promptInstall)}>
          Install
        </Button>
      ) : (
        <InstallSteps steps={installSteps(view, isMac(navigator.userAgent))} />
      )}
      {view === "chromium" && !window.isSecureContext && <p className="install-steps error">This page needs HTTPS or localhost to be installable.</p>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function InstallSteps({ steps }: { steps: string[] }) {
  return steps.length > 1 ? (
    <ol className="install-steps">
      {steps.map((s) => <li key={s}>{s}</li>)}
    </ol>
  ) : (
    <p className="install-steps">{steps[0]}</p>
  );
}

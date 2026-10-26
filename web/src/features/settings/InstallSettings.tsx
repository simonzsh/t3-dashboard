import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { detectBrowser, installSteps } from "./install.ts";

interface UADataNavigator extends Navigator {
  userAgentData?: { brands: { brand: string }[] };
}

export function InstallSettings() {
  const standalone = useMediaQuery("(display-mode: standalone)");
  const nav = navigator as UADataNavigator;
  const steps = installSteps(
    detectBrowser({ userAgent: nav.userAgent, touchPoints: nav.maxTouchPoints, brands: nav.userAgentData?.brands.map((b) => b.brand) }),
    /Macintosh/.test(nav.userAgent),
  );

  return (
    <div className="settings-row">
      <span>Install as an app</span>
      {standalone ? (
        <p className="install-steps">Installed.</p>
      ) : steps.length > 1 ? (
        <ol className="install-steps">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      ) : (
        <p className="install-steps">{steps[0]}</p>
      )}
    </div>
  );
}

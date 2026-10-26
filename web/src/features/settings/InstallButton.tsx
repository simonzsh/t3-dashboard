import { useRef, useState, useSyncExternalStore } from "react";
import { Button, Icon, IconButton, Popover } from "../../ui/index.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { detectBrowser, installView } from "./install.ts";
import { InstallSteps } from "./InstallSettings.tsx";
import { installState, promptInstall, subscribeInstall } from "./installPrompt.ts";

/** One click opens the browser's install dialog; browsers without one get their exact steps instead. */
export function InstallButton({ compact }: { compact: boolean }) {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, installState);
  const standalone = useMediaQuery("(display-mode: standalone)");
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const view = installView({ standalone, installed, canPrompt, browser: detectBrowser(navigator.userAgent, navigator.maxTouchPoints) });
  if (view === "installed") return null;
  const onClick = () => (view === "prompt" ? void promptInstall() : setOpen((o) => !o));
  return (
    <>
      {compact ? (
        <IconButton ref={anchor} label="Install app" tooltip="Install app" onClick={onClick}>
          <Icon name="download" strokeWidth={1.8} />
        </IconButton>
      ) : (
        <Button ref={anchor} onClick={onClick}>
          <Icon name="download" strokeWidth={1.8} />
          Install app
        </Button>
      )}
      {open && view !== "prompt" && (
        <Popover anchor={anchor} align="end" className="menu install-note" role="dialog" onClose={() => setOpen(false)}>
          <InstallSteps view={view} />
        </Popover>
      )}
    </>
  );
}

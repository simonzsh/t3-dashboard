import { useSyncExternalStore } from "react";
import { Button, Icon, IconButton } from "../../ui/index.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { installState, promptInstall, subscribeInstall } from "./installPrompt.ts";

/** One click opens the browser's install dialog; shown only while the browser offers it. */
export function InstallButton({ compact }: { compact: boolean }) {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, installState);
  const standalone = useMediaQuery("(display-mode: standalone)");
  if (!canPrompt || installed || standalone) return null;
  const install = () => void promptInstall();
  return compact ? (
    <IconButton label="Install app" tooltip="Install app" onClick={install}>
      <Icon name="download" strokeWidth={1.8} />
    </IconButton>
  ) : (
    <Button onClick={install}>
      <Icon name="download" strokeWidth={1.8} />
      Install app
    </Button>
  );
}

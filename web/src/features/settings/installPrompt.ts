// Chromium fires beforeinstallprompt once, soon after load: it must be caught before the Settings dialog exists.
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

export interface InstallState {
  canPrompt: boolean;
  installed: boolean;
}

let event: InstallPromptEvent | null = null;
let installed = false;
let snapshot: InstallState = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();

function update() {
  snapshot = { canPrompt: event !== null, installed };
  for (const listener of listeners) listener();
}

export function trackInstallPrompt(target: EventTarget): void {
  target.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    event = e as InstallPromptEvent;
    update();
  });
  target.addEventListener("appinstalled", () => {
    event = null;
    installed = true;
    update();
  });
}

export const subscribeInstall = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const installState = (): InstallState => snapshot;

/** Opens the browser's install dialog. An event works once: a refusal leaves the manual steps. */
export async function promptInstall(): Promise<void> {
  const current = event;
  if (!current) return;
  event = null;
  update();
  await current.prompt();
}

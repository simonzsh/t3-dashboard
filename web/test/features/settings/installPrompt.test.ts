import { test } from "bun:test";
import assert from "node:assert/strict";
import { installState, promptInstall, subscribeInstall, trackInstallPrompt } from "../../../src/features/settings/installPrompt.ts";

test("the install event is kept until the prompt runs, and appinstalled marks the app installed", async () => {
  const target = new EventTarget();
  trackInstallPrompt(target);
  assert.deepEqual(installState(), { canPrompt: false, installed: false });

  let notified = 0;
  const unsubscribe = subscribeInstall(() => notified++);
  let prompted = 0;
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => void prompted++ });
  target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(installState(), { canPrompt: true, installed: false });

  await promptInstall();
  assert.equal(prompted, 1);
  assert.equal(installState().canPrompt, false);
  await promptInstall();
  assert.equal(prompted, 1);

  target.dispatchEvent(new Event("appinstalled"));
  assert.deepEqual(installState(), { canPrompt: false, installed: true });
  assert.ok(notified >= 3);
  unsubscribe();
});

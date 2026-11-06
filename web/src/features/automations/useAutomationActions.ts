import { useCallback, useState } from "react";
import type { Automation } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useAction } from "../../lib/useAction.ts";

/** Pause or resume and run now. The switch moves at once; a failed call puts it back and shows the error. */
export function useAutomationActions(reload: () => Promise<void>) {
  const api = useApi();
  const toggling = useAction("change the automation");
  const running = useAction("run the automation");
  const [enabled, setEnabled] = useState<Readonly<Record<string, boolean>>>({});
  const [starting, setStarting] = useState<ReadonlySet<string>>(new Set());

  function toggle(a: Automation, on: boolean) {
    setEnabled((m) => ({ ...m, [a.id]: on }));
    void toggling
      .run(async () => {
        await api.setAutomationEnabled(a.id, on);
        await reload();
      })
      .then(() => setEnabled((m) => (m[a.id] !== on ? m : Object.fromEntries(Object.entries(m).filter(([id]) => id !== a.id)))));
  }

  function run(a: Automation) {
    const mark = (busy: boolean) =>
      setStarting((s) => {
        const next = new Set(s);
        if (busy) next.add(a.id);
        else next.delete(a.id);
        return next;
      });
    void running.run(async () => {
      await api.runAutomation(a.id);
      await reload();
    }, mark);
  }

  const withPending = useCallback((list: Automation[]) => list.map((a) => (a.id in enabled ? { ...a, enabled: enabled[a.id]! } : a)), [enabled]);

  return {
    toggle,
    run,
    starting,
    /** The list with the switches the user just moved. */
    withPending,
  };
}

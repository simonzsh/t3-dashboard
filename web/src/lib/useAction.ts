import { useState } from "react";
import { errorMessage } from "./format.ts";

// Runs an async action and keeps its error next to the button that started it.
// Several buttons can share the error line, each with its own busy flag: pass `setCallBusy`.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => unknown, setCallBusy: (busy: boolean) => void = setBusy): Promise<boolean> {
    setCallBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setCallBusy(false);
    }
  }
  return { busy, error, setError, run };
}

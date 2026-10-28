import { useState } from "react";
import { useNotify } from "./notices.tsx";
import { failure } from "./format.ts";

// Runs an async action. A failure goes to the error banner; `error` stays for styling the button.
// Several buttons can share one hook, each with its own busy flag: pass `setCallBusy`.
// `what` completes "Could not …" in the message, e.g. "send the message".
export function useAction(what?: string) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const setError = (message: string | null) => {
    setErrorState(message);
    if (message) notify(message);
  };
  async function run(fn: () => unknown, setCallBusy: (busy: boolean) => void = setBusy): Promise<boolean> {
    setCallBusy(true);
    setErrorState(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(what ? failure(what, e) : failure("complete this action", e));
      return false;
    } finally {
      setCallBusy(false);
    }
  }
  return { busy, error, setError, run };
}

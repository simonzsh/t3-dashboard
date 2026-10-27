// Calls made during a run share it; one more run follows, so the last call still sees fresh data.
export function singleFlight(fn: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  const run = async () => {
    try {
      await fn();
    } finally {
      if (again) {
        again = false;
        await run();
      } else running = null;
    }
  };
  return () => {
    if (running) again = true;
    else running = run();
    return running;
  };
}

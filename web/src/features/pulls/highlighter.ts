import { useEffect, useState } from "react";

export type Highlighter = typeof import("./highlight.tsx");

// highlight.js is about a quarter of the bundle and only the diff needs it: it loads on first use.
let loaded: Highlighter | null = null;
let loading: Promise<Highlighter | null> | null = null;

function load(): Promise<Highlighter | null> {
  // A failed load (a new build replaced the chunk) leaves the diff plain and lets a later file try again.
  return (loading ??= import("./highlight.tsx").then(
    (module) => (loaded = module),
    () => ((loading = null), null),
  ));
}

/** The highlighter once loaded; `wanted` starts the load. */
export function useHighlighter(wanted: boolean): Highlighter | null {
  const [module, setModule] = useState(loaded);
  useEffect(() => {
    if (!wanted || module) return;
    let live = true;
    void load().then((next) => live && next && setModule(next));
    return () => void (live = false);
  }, [wanted, module]);
  return module;
}

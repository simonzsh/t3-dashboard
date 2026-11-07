import { useEffect } from "react";
import { usePersisted } from "../../lib/storage.ts";
import { loadTint, saveTint } from "./tint.ts";

export function useTint(): [boolean, (on: boolean) => void] {
  const [tint, setTint] = usePersisted<boolean>(loadTint, saveTint);

  // data-tint="on" mixes the accent into the page, surfaces and lines (styles.css).
  useEffect(() => {
    if (tint) document.documentElement.setAttribute("data-tint", "on");
    else document.documentElement.removeAttribute("data-tint");
  }, [tint]);

  return [tint, setTint];
}

import { useEffect, useState } from "react";

export function delayValue<T>(value: T, ms: number, set: (value: T) => void): () => void {
  const timer = setTimeout(() => set(value), ms);
  return () => clearTimeout(timer);
}

/** The value as it was `ms` ago: it follows only once the input stops changing. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => delayValue(value, ms, setSettled), [value, ms]);
  return settled;
}

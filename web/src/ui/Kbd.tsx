import type { ReactNode } from "react";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={className}>{children}</kbd>;
}

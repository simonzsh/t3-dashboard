import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import { IconButton } from "./IconButton.tsx";
import type { ControlSize } from "./Button.tsx";

/** A side column that slides shut to zero width. It stays mounted, so it slides both ways; inert while hidden. */
export function SidePanel({ hidden, className, children }: { hidden: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={["side-panel", hidden && "hidden", className].filter(Boolean).join(" ")} inert={hidden}>
      {children}
    </div>
  );
}

interface ToggleProps {
  hidden: boolean;
  /** "Show the list", "Show files"… */
  show: string;
  hide: string;
  size?: ControlSize;
  onToggle: () => void;
}

/** The panel button that hides or shows a SidePanel. Its label names what a click does. */
export function SidePanelToggle({ hidden, show, hide, size = "md", onToggle }: ToggleProps) {
  const label = hidden ? show : hide;
  return (
    <IconButton variant="ghost" size={size} label={label} tooltip={label} onClick={onToggle}>
      <Icon name="panelLeft" />
    </IconButton>
  );
}

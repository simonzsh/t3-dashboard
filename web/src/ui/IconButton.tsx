import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { buttonClass, type ButtonVariant, type ControlSize } from "./Button.tsx";
import { Kbd } from "./Kbd.tsx";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Accessible name. */
  label: string;
  variant?: ButtonVariant;
  size?: ControlSize;
  kbd?: string;
  /** Only for icons whose meaning is not obvious: the window controls, attach, send… */
  tooltip?: string;
  shortcut?: string;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({ label, tooltip, shortcut, variant = "secondary", size = "md", kbd, className, type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} aria-label={label} data-tooltip={tooltip} data-shortcut={tooltip ? shortcut : undefined} className={buttonClass("icon-button", size, variant, className)}>
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

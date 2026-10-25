import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { buttonClass, type ButtonVariant, type ControlSize } from "./Button.tsx";
import { Kbd } from "./Kbd.tsx";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Accessible name, and the tooltip unless `title` says more (a shortcut, a state). */
  label: string;
  variant?: ButtonVariant;
  size?: ControlSize;
  kbd?: string;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({ label, title, variant = "secondary", size = "md", kbd, className, type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} aria-label={label} title={title ?? label} className={buttonClass("icon-button", size, variant, className)}>
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

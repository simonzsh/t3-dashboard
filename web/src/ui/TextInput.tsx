import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";
import { NO_AUTOFILL, SECRET_FIELD } from "./noAutofill.ts";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { ref?: Ref<HTMLInputElement> };
const cls = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

export function TextInput({ className, ...rest }: InputProps) {
  return <input {...NO_AUTOFILL} type="text" {...rest} className={cls("field", className)} />;
}

export function SecretInput({ className, ...rest }: InputProps) {
  return <input {...SECRET_FIELD} {...rest} className={cls(`field ${SECRET_FIELD.className}`, className)} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea {...NO_AUTOFILL} {...rest} className={cls("field", className)} />;
}

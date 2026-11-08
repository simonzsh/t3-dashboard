// Same breakpoint as the bottom bar in styles.css: there a dialog is a bottom sheet.
export const PHONE = "(max-width: 700px)";
export const TOUCH = "(pointer: coarse)";

const matches = (query: string) => typeof matchMedia === "function" && matchMedia(query).matches;

export const isPhone = () => matches(PHONE);
export const isTouch = () => matches(TOUCH);

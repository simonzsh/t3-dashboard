// Same breakpoint as the bottom bar in styles.css: there a dialog is a bottom sheet.
export const PHONE = "(max-width: 700px)";
export const TOUCH = "(pointer: coarse)";
// Room for a side column beside the main content (the file tree of a pull request).
export const WIDE = "(min-width: 1100px)";

const matches = (query: string) => typeof matchMedia === "function" && matchMedia(query).matches;

export const isPhone = () => matches(PHONE);
export const isTouch = () => matches(TOUCH);

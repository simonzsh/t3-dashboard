import { createContext } from "react";

/** False while the parent Dialog animates in; true outside a dialog. */
export const DialogReady = createContext(true);

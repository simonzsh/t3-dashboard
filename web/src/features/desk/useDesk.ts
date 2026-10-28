import { useEffect, useReducer, type Dispatch } from "react";
import { deskReducer, loadDesk, saveDesk, type DeskAction, type DeskState } from "./desk.ts";
import { browserStorage } from "../../lib/storage.ts";

// localStorage starts the desk at once and keeps focus and maximize; the windows come from the server (useDeskSync).
export function useDesk(): [DeskState, Dispatch<DeskAction>] {
  const [desk, dispatch] = useReducer(deskReducer, undefined, () => loadDesk(browserStorage()));
  useEffect(() => saveDesk(browserStorage(), desk), [desk]);
  return [desk, dispatch];
}

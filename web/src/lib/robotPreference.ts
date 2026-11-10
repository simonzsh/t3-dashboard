import { createContext } from "react";
import { readKey, writeKey, type Store } from "./storage.ts";

export const ROBOT_KEY = "t3-dashboard-show-robot";
export const RobotVisibilityContext = createContext(true);

export const loadRobotVisibility = (storage: Store | null): boolean => readKey(storage, ROBOT_KEY) !== "off";
export const saveRobotVisibility = (storage: Store | null, visible: boolean): void =>
  writeKey(storage, ROBOT_KEY, visible ? "on" : "off");

import type { LinearKeyBody, SettingsResult } from "../../shared/api.ts";
import type { ReadFile } from "../config/config.ts";
import { HttpError } from "../server/httpError.ts";
import type { LinearBoard } from "./linearBoard.ts";
import { readLinearFile, toSimple, writeLinearConfig } from "../config/linearFile.ts";
import type { SimpleLinearConfig } from "../config/linearFile.ts";

export interface SettingsOptions {
  file: string;
  readFile: ReadFile;
  writeSecret(file: string, text: string): void;
  board: Pick<LinearBoard, "invalidate" | "verifyKey">;
}

export interface Settings {
  get(): SettingsResult;
  connectKey(body: LinearKeyBody): Promise<SettingsResult>;
  disconnect(): SettingsResult;
}

export function createSettings(options: SettingsOptions): Settings {
  const { file, readFile, writeSecret, board } = options;
  const read = () => {
    const { workspaces, legacy } = readLinearFile(file, readFile);
    return { config: toSimple(workspaces), legacy, keyed: workspaces.filter((workspace) => workspace.apiKey !== "").length };
  };
  // Converting a legacy file with several keys would drop all but one of them.
  const guard = () => {
    const current = read();
    if (current.legacy && current.keyed > 1) throw new HttpError(409, "linear.json holds several keys: edit it by hand.");
    return current;
  };
  const save = (next: SimpleLinearConfig) => {
    writeLinearConfig(file, next, writeSecret);
    board.invalidate();
  };
  const result = (): SettingsResult => {
    const { config, legacy } = read();
    const { apiKey } = config;
    return {
      linear: { connected: apiKey !== "", keyTail: apiKey === "" ? null : apiKey.slice(-4), legacy },
    };
  };

  return {
    get: result,
    async connectKey({ apiKey }) {
      const key = typeof apiKey === "string" ? apiKey.trim() : "";
      if (key === "") throw new HttpError(400, "Enter a Linear API key.");
      guard();
      const check = await board.verifyKey(key);
      if (check === "refused") throw new HttpError(400, "Linear refused this key.");
      if (check === "unreachable") throw new HttpError(502, "Linear is unreachable.");
      save({ apiKey: key });
      return result();
    },
    disconnect() {
      guard();
      save({ apiKey: "" });
      return result();
    },
  };
}

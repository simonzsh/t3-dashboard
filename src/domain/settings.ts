import type { LinearKeyBody, SettingsResult } from "../../shared/api.ts";
import type { ReadFile } from "../config/config.ts";
import { IntegrationError } from "../integrations/errors.ts";
import { DomainError } from "./errors.ts";
import type { LinearBoard } from "./linearBoard.ts";
import { readLinearKey, writeLinearKey } from "../config/linearFile.ts";

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
  const save = (apiKey: string) => {
    writeLinearKey(file, apiKey, writeSecret);
    board.invalidate();
  };
  const result = (): SettingsResult => {
    const apiKey = readLinearKey(file, readFile);
    return { linear: { connected: apiKey !== "", keyTail: apiKey === "" ? null : apiKey.slice(-4) } };
  };

  return {
    get: result,
    async connectKey({ apiKey }) {
      const key = typeof apiKey === "string" ? apiKey.trim() : "";
      if (key === "") throw new DomainError("invalid", "Enter a Linear API key.");
      const check = await board.verifyKey(key);
      if (check === "refused") throw new DomainError("invalid", "Linear refused this key.");
      if (check === "unreachable") throw new IntegrationError("Linear is unreachable.", { system: "linear", kind: "unreachable" });
      save(key);
      return result();
    },
    disconnect() {
      save("");
      return result();
    },
  };
}

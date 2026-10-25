import type { LinearKeyBody, LinearTeamsBody, LinearTeamsResult, SettingsResult, TeamTable, TokenSource } from "../shared/api.ts";
import type { ReadFile } from "./config.ts";
import { HttpError } from "./httpError.ts";
import type { LinearBoard } from "./linear.ts";
import { readLinearFile, toSimple, writeLinearConfig } from "./linearConfig.ts";
import type { SimpleLinearConfig } from "./linearConfig.ts";

export interface SettingsOptions {
  file: string;
  configDir: string;
  readFile: ReadFile;
  writeSecret(file: string, text: string): void;
  board: Pick<LinearBoard, "invalidate" | "verifyKey" | "listTeams">;
  tokenSource: () => TokenSource | null;
}

export interface Settings {
  get(): SettingsResult;
  connectKey(body: LinearKeyBody): Promise<SettingsResult>;
  disconnect(): SettingsResult;
  teams(): Promise<LinearTeamsResult>;
  saveTeams(body: LinearTeamsBody): SettingsResult;
  /** Remembers the T3 project chosen when assigning an issue of this team. */
  rememberTeam(teamKey: string, projectTitle: string): void;
}

export function parseTeamsBody(body: Record<string, unknown>): LinearTeamsBody {
  const { teams, unlisted } = body;
  const table = typeof teams === "object" && teams !== null && !Array.isArray(teams) ? Object.entries(teams) : null;
  if (!table || !table.every(([key, value]) => key.trim() !== "" && (typeof value === "string" || value === null)) || (unlisted !== "show" && unlisted !== "hide")) {
    throw new HttpError(400, "teams (team key to project title or null) and unlisted (show or hide) are required");
  }
  return { teams: Object.fromEntries(table) as TeamTable, unlisted };
}

export function createSettings(options: SettingsOptions): Settings {
  const { file, configDir, readFile, writeSecret, board } = options;
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
    const { apiKey, teams, unlisted } = config;
    return {
      linear: { connected: apiKey !== "", keyTail: apiKey === "" ? null : apiKey.slice(-4), legacy, teams, unlisted },
      t3: { tokenSource: options.tokenSource() },
      configDir,
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
      save({ ...read().config, apiKey: key });
      return result();
    },
    disconnect() {
      save({ ...guard().config, apiKey: "" });
      return result();
    },
    async teams() {
      const { apiKey } = read().config;
      if (apiKey === "") throw new HttpError(409, "Linear is not connected");
      const found = await board.listTeams(apiKey);
      if (found === "refused") throw new HttpError(502, "Linear refused this key.");
      if (typeof found === "string") throw new HttpError(502, "Linear is unreachable.");
      return found;
    },
    saveTeams({ teams, unlisted }) {
      save({ apiKey: guard().config.apiKey, teams, unlisted });
      return result();
    },
    rememberTeam(teamKey, projectTitle) {
      const { config, legacy, keyed } = read();
      if (legacy && keyed > 1) return;
      save({ ...config, teams: { ...config.teams, [teamKey]: projectTitle } });
    },
  };
}

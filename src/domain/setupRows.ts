import type { AgentTool, HookRow, JsonValue, McpServer, McpTransport, SetupContent, SetupIssue, SetupScope } from "../../shared/agentSetup.ts";
import type { JsonObject, RawHook } from "../config/agentConfigFiles.ts";
import { maskArgs, maskData, maskString } from "./secretMask.ts";

/** Masked data over this size is not sent. */
export const MAX_DATA_BYTES = 64 * 1024;
const FIELD_KEYS = ["name", "description", "model", "tools", "when_to_use"];
const MAX_FIELD_CHARS = 1000;
const MAX_TARGET_CHARS = 200;

const str = (value: JsonValue | undefined): string | null => (typeof value === "string" ? value : null);
const entries = (value: JsonValue | undefined): [string, JsonValue][] => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.entries(value) : []);

/** The masked data of a parsed file, or null when it is too big to send. */
export function dataContent(value: JsonValue, format: "json" | "toml"): SetupContent | null {
  const { value: masked } = maskData(value);
  return JSON.stringify(masked).length > MAX_DATA_BYTES ? null : { type: "data", format, value: masked };
}

export function fieldsContent(frontmatter: Record<string, string>): Extract<SetupContent, { type: "fields" }> {
  const fields = FIELD_KEYS.flatMap((key) => (frontmatter[key] ? [{ key, value: maskString(frontmatter[key]!, key).slice(0, MAX_FIELD_CHARS) }] : []));
  return { type: "fields", fields };
}

export interface ServerOrigin {
  id: string;
  name: string;
  tool: AgentTool;
  scope: SetupScope;
  sourceFileId: string;
  projectIds: string[];
}

function transportOf(raw: JsonObject, tool: AgentTool, issues: SetupIssue[]): McpTransport {
  const type = str(raw.type)?.toLowerCase();
  if (type === "stdio") return "stdio";
  if (type === "http" || type === "streamable-http") return "http";
  if (type === "sse") return "sse";
  if (type === "ws" || type === "websocket") return "ws";
  if (type !== undefined) return "unknown";
  if (typeof raw.command === "string") return "stdio";
  if (typeof raw.url !== "string") return "unknown";
  if (tool === "codex") return "http";
  issues.push({ code: "url-without-type", severity: "error", message: "The entry has a url but no type: Claude skips it. Add type http or sse." });
  return "unknown";
}

/** An MCP server entry of either tool, with every value masked. */
export function toMcpServer(raw: JsonObject, origin: ServerOrigin): McpServer {
  const issues: SetupIssue[] = [];
  let masked = false;
  const hide = (value: string, key: string | null): string => {
    const out = maskString(value, key);
    if (out !== value) masked = true;
    return out;
  };
  const rows = (value: JsonValue | undefined) => entries(value).map(([key, item]) => ({ key, value: hide(typeof item === "string" ? item : JSON.stringify(item), key) }));
  const command = str(raw.command);
  const url = str(raw.url);
  const args = Array.isArray(raw.args) ? raw.args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))) : [];
  const maskedArgs = maskArgs(args);
  if (maskedArgs.some((arg, at) => arg !== args[at])) masked = true;
  const refs = (names: JsonValue | undefined) => (Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : []);
  const headers = [
    ...rows(raw.headers),
    ...rows(raw.http_headers),
    ...entries(raw.env_http_headers).map(([key, name]) => ({ key, value: `$${typeof name === "string" ? name : ""}` })),
    ...(typeof raw.bearer_token_env_var === "string" ? [{ key: "Authorization", value: `Bearer $${raw.bearer_token_env_var}` }] : []),
  ];
  return {
    ...origin,
    transport: transportOf(raw, origin.tool, issues),
    command: command === null ? null : hide(command, "command"),
    args: maskedArgs,
    url: url === null ? null : hide(url, "url"),
    env: [...rows(raw.env), ...refs(raw.env_vars).map((name) => ({ key: name, value: `$${name}` }))],
    headers,
    enabled: raw.enabled !== false,
    masked,
    issues,
  };
}

export function toHookRow(hook: RawHook, origin: { tool: AgentTool; scope: SetupScope; sourceFileId: string }): HookRow {
  const target = maskString(hook.target, "target").split(/\r?\n/)[0]!.slice(0, MAX_TARGET_CHARS);
  return { id: `${origin.sourceFileId}#${hook.event}#${hook.groupIndex}.${hook.handlerIndex}`, ...origin, event: hook.event, matcher: hook.matcher, type: hook.type, target, timeoutSec: hook.timeoutSec };
}

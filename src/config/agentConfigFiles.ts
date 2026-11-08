import type { JsonValue } from "../../shared/agentSetup.ts";

// Pure parsers for the files Claude and Codex read. They keep raw values: masking happens in the domain.

export type JsonObject = { [key: string]: JsonValue };
export type Parsed = { ok: true; value: JsonValue } | { ok: false };

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** TOML gives dates (Date or Temporal objects) and bigints; JSON has neither. */
function toJson(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value !== "object" || value === null) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return String(value);
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, toJson(item)]));
}

export function parseJson(text: string): Parsed {
  try {
    return { ok: true, value: toJson(JSON.parse(text)) };
  } catch {
    return { ok: false };
  }
}

export function parseToml(text: string): Parsed {
  try {
    return { ok: true, value: toJson(Bun.TOML.parse(text)) };
  } catch {
    return { ok: false };
  }
}

export interface RawHook {
  event: string;
  matcher: string | null;
  /** command | http | mcp_tool | prompt | agent, or the raw value. */
  type: string;
  /** Unmasked: the command, url, tool name or prompt. */
  target: string;
  timeoutSec: number | null;
  groupIndex: number;
  handlerIndex: number;
}

const text = (value: JsonValue | undefined): string => (typeof value === "string" ? value : "");

function hookTarget(type: string, handler: JsonObject): string {
  if (type === "command") return [text(handler.command), ...(Array.isArray(handler.args) ? handler.args.filter((arg) => typeof arg === "string") : [])].join(" ");
  if (type === "http") return text(handler.url);
  if (type === "mcp_tool") return [text(handler.server), text(handler.tool)].filter(Boolean).join("/");
  return text(handler.prompt) || text(handler.command) || text(handler.url);
}

/** The `hooks` value: event -> matcher groups -> handlers. */
export function parseHooks(hooks: JsonValue | undefined): RawHook[] {
  if (!isObject(hooks)) return [];
  const rows: RawHook[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, groupIndex) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return;
      group.hooks.forEach((handler, handlerIndex) => {
        if (!isObject(handler)) return;
        const type = text(handler.type) || "command";
        const timeout = handler.timeout;
        rows.push({ event, matcher: typeof group.matcher === "string" ? group.matcher : null, type, target: hookTarget(type, handler), timeoutSec: typeof timeout === "number" ? timeout : null, groupIndex, handlerIndex });
      });
    });
  }
  return rows;
}

export interface ClaudeSettings {
  hooks: RawHook[];
  enabledPlugins: Record<string, boolean>;
}

export function parseClaudeSettings(value: JsonValue): ClaudeSettings | null {
  if (!isObject(value)) return null;
  const plugins = isObject(value.enabledPlugins) ? value.enabledPlugins : {};
  return {
    hooks: parseHooks(value.hooks),
    enabledPlugins: Object.fromEntries(Object.entries(plugins).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")),
  };
}

const serversOf = (holder: JsonValue | undefined): Record<string, JsonObject> => {
  const servers = isObject(holder) ? holder.mcpServers : undefined;
  return isObject(servers) ? Object.fromEntries(Object.entries(servers).filter((entry): entry is [string, JsonObject] => isObject(entry[1]))) : {};
};

/** The `mcpServers` of a `.mcp.json`, or the user-scope ones of `.claude.json`. */
export const mcpServersOf = serversOf;

/** The local-scope servers `.claude.json` keeps for one project folder. */
export function localMcpServers(state: JsonValue, root: string): Record<string, JsonObject> {
  const projects = isObject(state) ? state.projects : undefined;
  return isObject(projects) ? serversOf(projects[root]) : {};
}

export interface CodexConfig {
  mcpServers: Record<string, JsonObject>;
  hooks: RawHook[];
  /** Project path -> trust_level. */
  trust: Record<string, string>;
  fallbackNames: string[];
  maxBytes: number | null;
}

export function parseCodexConfig(value: JsonValue): CodexConfig | null {
  if (!isObject(value)) return null;
  const servers = isObject(value.mcp_servers) ? value.mcp_servers : {};
  const projects = isObject(value.projects) ? value.projects : {};
  const trust: Record<string, string> = {};
  for (const [path, entry] of Object.entries(projects)) if (isObject(entry) && typeof entry.trust_level === "string") trust[path] = entry.trust_level;
  const fallback = value.project_doc_fallback_filenames;
  return {
    mcpServers: Object.fromEntries(Object.entries(servers).filter((entry): entry is [string, JsonObject] => isObject(entry[1]))),
    hooks: parseHooks(value.hooks),
    trust,
    fallbackNames: Array.isArray(fallback) ? fallback.filter((name): name is string => typeof name === "string") : [],
    maxBytes: typeof value.project_doc_max_bytes === "number" ? value.project_doc_max_bytes : null,
  };
}

/** The top-level `key: value` lines between the `---` fences; a folded `>` or `|` value takes its indented lines. */
export function parseFrontmatter(source: string): Record<string, string> {
  const lines = source.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const fields: Record<string, string> = {};
  for (let at = 1; at < lines.length; at++) {
    const line = lines[at]!;
    if (line.trim() === "---") break;
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (/^[>|][+-]?$/.test(value)) {
      const parts: string[] = [];
      while (at + 1 < lines.length && /^\s+\S/.test(lines[at + 1]!)) parts.push(lines[++at]!.trim());
      value = parts.join(" ");
    }
    fields[match[1]!] = value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}

const PATH_LIKE = /^(\.\.?\/|~\/|\/)|\.(md|markdown|txt|json|toml|ya?ml|mdc)$/i;

/** The `@path` imports of a CLAUDE.md: outside code fences and spans, and shaped like a path (not `@types/node`). */
export function extractImports(markdown: string): string[] {
  const found: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const mark = /^\s*(```|~~~)/.exec(line)?.[1];
    if (mark) {
      fence = fence === null ? mark : fence === mark ? null : fence;
      continue;
    }
    if (fence !== null) continue;
    for (const match of line.replace(/`[^`]*`/g, " ").matchAll(/(?:^|\s)@((?:\\ |\S)+)/g)) {
      const path = match[1]!.replace(/[.,;:!?)\]]+$/, "").replaceAll("\\ ", " ");
      if (PATH_LIKE.test(path) && !found.includes(path)) found.push(path);
    }
  }
  return found;
}

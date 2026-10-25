import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { t3Home } from "./runtime.ts";

// T3 publishes no schema for its commands, but its web client holds them as Effect Schema structs.
// This reads that bundle as plain text: it never imports or runs it.

/** A struct to find: the one whose `type` literal is `type` and which has the `marker` key. */
export interface StructSpec {
  name: string;
  type: string;
  marker: string;
}

/** Key → "required" or "optional", then the literal values the key accepts, if any. */
export type Shape = Record<string, string>;

export interface Extraction {
  shapes: Record<string, Shape>;
  /** No struct with this literal: T3 dropped it. */
  missing: string[];
  /** The literal is there but its struct cannot be parsed. */
  failed: string[];
}

type Env = Record<string, string | undefined>;

export const bundleDir = (env: Env, homedir: string, version: string): string => join(t3Home(env, homedir), "runtime", "versions", version, "client", "assets");

export const readBundle = (dir: string): string[] =>
  readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8"));

const ID = "[A-Za-z_$][\\w$]*";
const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class ParseError extends Error {}

// A slash after one of these starts a regex literal, not a division.
const isRegexStart = (text: string, at: number): boolean => /[(,=:[!&|?{};]/.test(text.slice(0, at).trimEnd().slice(-1)) && !"/*".includes(text[at + 1] ?? "");

/** Index just after the string, template or regex that starts at `at`, or `at + 1`. */
function skip(text: string, at: number): number {
  const quote = text[at]!;
  if (quote === "/" && isRegexStart(text, at)) {
    let inClass = false;
    for (let i = at + 1; i < text.length; i++) {
      const c = text[i];
      if (c === "\\") i++;
      else if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) return i + 1;
    }
    throw new ParseError("unterminated regex");
  }
  if (quote !== '"' && quote !== "'" && quote !== "`") return at + 1;
  for (let i = at + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (quote === "`" && c === "$" && text[i + 1] === "{") i = closeOf(text, i + 1);
    else if (c === quote) return i + 1;
  }
  throw new ParseError("unterminated string");
}

/** Index of the bracket that closes the one at `open`. */
function closeOf(text: string, open: number): number {
  const stack: string[] = [];
  for (let i = open; i < text.length; ) {
    const c = text[i]!;
    if (c in CLOSERS) stack.push(CLOSERS[c]!);
    else if (c === ")" || c === "]" || c === "}") {
      if (stack.pop() !== c) throw new ParseError("unbalanced");
      if (stack.length === 0) return i;
    }
    i = skip(text, i);
  }
  throw new ParseError("unbalanced");
}

/** Index of the `{` that opens the object holding `at`; templates are skipped, other strings are rare there. */
function openOf(text: string, at: number): number {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = text[i]!;
    if (c === "`") i = text.lastIndexOf("`", i - 1);
    else if (c === ")" || c === "]" || c === "}") depth++;
    else if (c === "(" || c === "[" || c === "{") {
      if (depth === 0) return c === "{" ? i : -1;
      depth--;
    }
  }
  return -1;
}

/** Top-level comma-separated parts of text[start, end). */
function parts(text: string, start: number, end: number): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = start;
  for (let i = start; i < end; ) {
    const c = text[i]!;
    if (c in CLOSERS) depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
    i = skip(text, i);
  }
  out.push(text.slice(from, end));
  return out.filter((part) => part !== "");
}

/** The expression assigned to `name` at top level, with its start index, or null. */
function definition(text: string, name: string): { start: number; value: string } | null {
  const match = new RegExp(`(?<![\\w$.])${escape(name)}=(?!=)`).exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 0;
  for (let i = start; i < text.length; ) {
    const c = text[i]!;
    if (c in CLOSERS) depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    if (depth < 0 || (depth === 0 && (c === "," || c === ";"))) return { start, value: text.slice(start, i) };
    i = skip(text, i);
  }
  return { start, value: text.slice(start) };
}

function objectEntries(text: string, open: number, close: number): Map<string, string> {
  const entries = new Map<string, string>();
  for (const part of parts(text, open + 1, close)) {
    const spread = new RegExp(`^\\.\\.\\.(${ID})$`).exec(part);
    if (spread) {
      for (const [key, value] of spreadEntries(text, spread[1]!)) entries.set(key, value);
      continue;
    }
    const entry = new RegExp(`^(${ID}|"[^"]*"|'[^']*'):([\\s\\S]+)$`).exec(part);
    if (!entry) throw new ParseError("unknown entry");
    entries.set(entry[1]!.replace(/^["']|["']$/g, ""), entry[2]!);
  }
  return entries;
}

// A spread names a plain object (`uM={…}`) or a struct (`uM=P({…})`).
function spreadEntries(text: string, name: string): Map<string, string> {
  const found = definition(text, name);
  const brace = found?.value.match(new RegExp(`^(?:${ID}\\()?\\{`));
  if (!found || !brace) throw new ParseError("unresolved spread");
  const open = found.start + brace[0].length - 1;
  return objectEntries(text, open, closeOf(text, open));
}

type Found = { entries: Map<string, string>; text: string } | "missing" | "failed";

function findStruct(sources: string[], spec: StructSpec): Found {
  let seen = false;
  let failed = false;
  for (const text of sources) {
    for (const match of text.matchAll(new RegExp(`type:${ID}\\(\`${escape(spec.type)}\`\\)`, "g"))) {
      seen = true;
      try {
        const open = openOf(text, match.index);
        if (open < 0) continue;
        const entries = objectEntries(text, open, closeOf(text, open));
        if (entries.has(spec.marker)) return { entries, text };
      } catch (error) {
        if (!(error instanceof ParseError)) throw error;
        failed = true;
      }
    }
  }
  return failed || seen ? "failed" : "missing";
}

const LITERAL_UNION = new RegExp(`^${ID}\\(\\[\`[^\`]*\`(?:,\`[^\`]*\`)*\\]\\)$`);

// An identifier is followed once, and only to a literal union: other schemas hold unrelated literals.
function literals(expression: string, text: string): string[] {
  const target = new RegExp(`^${ID}$`).test(expression) ? (definition(text, expression)?.value ?? null) : expression;
  if (target === null || (target !== expression && !LITERAL_UNION.test(target))) return [];
  return [...new Set([...target.matchAll(/`([^`$]*)`/g)].map((match) => match[1]!))].sort();
}

function shapeOf(entries: Map<string, string>, optional: string, text: string): Shape {
  const shape: Shape = {};
  for (const [key, value] of entries) {
    if (key === "type") continue;
    const isOptional = value.startsWith(`${optional}(`) && value.endsWith(")");
    const values = literals(isOptional ? value.slice(optional.length + 1, -1) : value, text);
    shape[key] = `${isOptional ? "optional" : "required"}${values.length > 0 ? `: ${values.join(" | ")}` : ""}`;
  }
  return shape;
}

// The optional wrapper's name changes with each build: `holdQueue` of run.interrupt is optional.
function optionalWrapper(sources: string[]): string {
  const found = findStruct(sources, { name: "run.interrupt", type: "run.interrupt", marker: "holdQueue" });
  const name = typeof found === "object" ? new RegExp(`^(${ID})\\(`).exec(found.entries.get("holdQueue")!)?.[1] : undefined;
  if (!name) throw new Error("Cannot find the optional wrapper of this T3 build");
  return name;
}

/** Throws when the bundle cannot be read at all, so that a build change never looks like drift. */
export function extractShapes(sources: string[], specs: StructSpec[]): Extraction {
  const optional = optionalWrapper(sources);
  const result: Extraction = { shapes: {}, missing: [], failed: [] };
  for (const spec of specs) {
    const found = findStruct(sources, spec);
    if (found === "missing") result.missing.push(spec.name);
    else if (found === "failed") result.failed.push(spec.name);
    else result.shapes[spec.name] = shapeOf(found.entries, optional, found.text);
  }
  return result;
}

export function compareSnapshot(saved: Record<string, Shape>, current: Record<string, Shape>): string[] {
  const out: string[] = [];
  for (const name of [...new Set([...Object.keys(saved), ...Object.keys(current)])].sort()) {
    const before = saved[name];
    const after = current[name];
    if (!before) out.push(`${name}: not in the snapshot`);
    else if (!after) out.push(`${name}: no longer in the bundle`);
    else {
      for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
        if (before[key] === undefined) out.push(`${name}.${key}: added (${after[key]})`);
        else if (after[key] === undefined) out.push(`${name}.${key}: removed (was ${before[key]})`);
        else if (before[key] !== after[key]) out.push(`${name}.${key}: ${before[key]}, now ${after[key]}`);
      }
    }
  }
  return out;
}

const allowedValues = (description: string): string[] => description.split(": ")[1]?.split(" | ") ?? [];

// A string, or the `type` of an object such as dispatchMode: the values we can compare to a literal list.
const tagOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof (value as { type?: unknown } | null)?.type === "string" ? (value as { type: string }).type : undefined;

/** Compares the payloads we build with the shapes from the bundle. Messages hold key names only. */
export function checkPayloads(shapes: Record<string, Shape>, payloads: Record<string, Record<string, unknown>[]>): string[] {
  const out: string[] = [];
  for (const [name, list] of Object.entries(payloads)) {
    const shape = shapes[name];
    if (!shape) continue;
    const sent = new Set<string>();
    for (const payload of list) {
      for (const [key, value] of Object.entries(payload)) {
        if (key === "type") continue;
        sent.add(key);
        const description = shape[key];
        if (description === undefined) out.push(`${name}.${key}: sent, but T3 does not know it`);
        else {
          const allowed = allowedValues(description);
          const tag = tagOf(value);
          if (allowed.length > 0 && tag !== undefined && !allowed.includes(tag)) out.push(`${name}.${key}: a value we send is not in the T3 list`);
        }
      }
    }
    for (const [key, description] of Object.entries(shape)) {
      if (description.startsWith("required") && !sent.has(key)) out.push(`${name}.${key}: required by T3, never sent`);
    }
  }
  return [...new Set(out)].sort();
}

export const missingTags = (sources: string[], tags: string[]): string[] => tags.filter((tag) => !sources.some((text) => text.includes(`\`${tag}\``)));

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { test } from "bun:test";

// Dependency direction between folders, read from the import lines. README "Architecture" explains it.
const ROOT = join(import.meta.dir, "..");
const toPosix = (path: string) => path.split(sep).join("/");

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

/** The folder a file belongs to, as the rules name it; null for a file outside every folder. */
function layer(path: string): string | null {
  const parts = path.split("/");
  if (parts[0] === "shared") return "shared";
  if (path === "src/main.ts") return "main";
  if (parts[0] === "src") {
    if (parts[1] === "integrations") return parts.length === 3 ? `integrations/${parts[2]!.replace(/\.ts$/, "")}` : `integrations/${parts[2]}/`;
    return ["app", "cli", "config", "server", "domain"].includes(parts[1]!) && parts.length > 2 ? parts[1]! : null;
  }
  if (path === "web/index.html") return "web/html";
  if (parts[0] === "web" && parts[1] === "src") {
    if (parts.length === 3) return "web/root";
    if (parts[2] === "features") return `features/${parts[3]}`;
    return ["ui", "lib", "api"].includes(parts[2]!) ? parts[2]! : null;
  }
  return null;
}

const INTEGRATION_CORE = ["integrations/contract", "integrations/errors", "integrations/drift"];

/** May `from` import `to`? Each rule lists the folders a folder may reach. */
function allowed(from: string, to: string): boolean {
  if (from === to) return true;
  if (from === "app" || from === "web/root") return true;
  if (from === "main") return ["app", "cli", "config"].includes(to);
  if (from === "shared") return false;
  if (from === "config") return to === "shared";
  if (INTEGRATION_CORE.includes(from)) return INTEGRATION_CORE.includes(to);
  // An integration reads config and shared types; it never reaches the domain or another integration.
  if (from.startsWith("integrations/")) return INTEGRATION_CORE.includes(to) || ["config", "shared"].includes(to);
  if (from === "domain") return ["shared", "config"].includes(to) || to.startsWith("integrations/");
  // The server reaches T3 and Linear through the domain; it only knows the integration error type.
  if (from === "server") return ["shared", "domain", "config", "integrations/errors"].includes(to);
  if (from === "cli") return ["config", "integrations/github/", "integrations/errors"].includes(to);
  if (from === "ui") return false;
  if (from === "lib") return ["ui", "api", "shared"].includes(to);
  if (from === "api") return to === "shared";
  if (from.startsWith("features/")) return ["lib", "api", "ui", "shared"].includes(to) || FEATURE_EDGES.has(`${from} -> ${to}`);
  return false;
}

// A feature that shows part of another one. The list stays short and has no cycle.
const FEATURE_EDGES = new Map([
  ["features/desk -> features/conversation", "a desk window holds a conversation"],
  ["features/new-thread -> features/conversation", "the new thread dialog reuses the composer"],
  ["features/board -> features/settings", "the board setup card reuses the Linear key form"],
  ["features/board -> features/new-thread", "assigning an issue opens the New Agent dialog"],
  ["features/agents -> features/new-thread", "the reminder input uses the New Agent model preset"],
  ["features/settings -> features/update", "the Updates tab shows the update status"],
  ["features/settings -> features/desk", "settings pick the desk background"],
]);

// One file that breaks its folder's rule, with the reason.
const EXCEPTIONS = new Map([
  ["web/src/ui/Dropdown.tsx -> web/src/lib/dropdown.ts", "the dropdown menu logic is pure and tested in lib"],
  ["web/src/ui/Popover.tsx -> web/src/lib/dropdown.ts", "the popover uses the same menu placement"],
]);

const SPECIFIER = /(?:^|\s)(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

const files = [...sources("src"), ...sources("shared"), ...sources("web/src")];
const edges = files.flatMap((path) => {
  const text = readFileSync(join(ROOT, path), "utf8");
  return [...text.matchAll(SPECIFIER)]
    .map((match) => match[1] ?? match[2]!)
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => ({ from: path, to: toPosix(relative(ROOT, normalize(join(ROOT, dirname(path), specifier)))) }));
});

test("every source file sits in a known folder", () => {
  assert.deepEqual(files.filter((path) => layer(path) === null), []);
});

test("imports follow the dependency rules between folders", () => {
  const broken = edges
    .filter(({ from, to }) => !EXCEPTIONS.has(`${from} -> ${to}`))
    .filter(({ from, to }) => {
      const target = layer(to);
      return target === null || !allowed(layer(from)!, target);
    })
    .map(({ from, to }) => `${from} -> ${to}`);
  assert.deepEqual(broken, []);
});

test("the web never imports server code", () => {
  assert.deepEqual(edges.filter(({ from, to }) => from.startsWith("web/") && to.startsWith("src/")).map(({ from, to }) => `${from} -> ${to}`), []);
});

// Keeps the lists honest: an entry nobody needs any more must go.
test("every feature edge and exception is still used", () => {
  const used = new Set(edges.flatMap(({ from, to }) => [`${from} -> ${to}`, `${layer(from)} -> ${layer(to)}`]));
  for (const key of [...FEATURE_EDGES.keys(), ...EXCEPTIONS.keys()]) assert.ok(used.has(key), `${key} is no longer imported: drop it`);
});

test("the rules catch a forbidden import", () => {
  assert.equal(allowed("domain", "server"), false);
  assert.equal(allowed("integrations/t3/", "domain"), false);
  assert.equal(allowed("integrations/t3/", "integrations/linear/"), false);
  assert.equal(allowed("server", "integrations/t3/"), false);
  assert.equal(allowed("ui", "features/board"), false);
  assert.equal(allowed("lib", "features/board"), false);
  assert.equal(allowed("features/board", "features/desk"), false);
  assert.equal(allowed("shared", "domain"), false);
});

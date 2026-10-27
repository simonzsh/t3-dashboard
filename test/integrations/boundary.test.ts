import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "bun:test";

// Every call to another system lives in src/integrations/. Only server code is scanned:
// the browser bundle talks to the dashboard's own /api, and scripts/ drive the built binary.
const SRC = join(import.meta.dir, "..", "..", "src");

interface Rule {
  name: string;
  pattern: RegExp;
  /** Files outside integrations/ that may match, with the reason. */
  allowed: Record<string, string>;
}

const RULES: Rule[] = [
  {
    name: "fetch call",
    // Skips only a `fetch(...) {` or `fetch(...):` method definition (the server's own handler).
    pattern: /^(?!\s*(?:async\s+)?fetch\([^)]*\)\s*[:{]).*(?:(?<![\w.])fetch\(|globalThis\.fetch\b)/m,
    allowed: {
      "app/start.ts": "composition root: hands the real fetch to the Linear and GitHub clients",
      "app/deps.ts": "install probe of the dashboard's own /api/health",
    },
  },
  { name: "WebSocket", pattern: /new WebSocket\b|globalThis\.WebSocket\b/, allowed: {} },
  {
    name: "process spawn",
    pattern: /\bBun\.spawn(?:Sync)?\(|\bspawn(?:Sync)?\(|node:child_process/,
    allowed: {
      "app/start.ts": "restarts the dashboard itself after an update",
      "app/deps.ts": "OS tools for the service (systemctl, launchctl, schtasks, open), never t3",
    },
  },
  {
    name: "T3, Linear or GitHub location",
    pattern:
      /server-runtime\.json|environment-id|"\.t3"|"auth", "session"|api\.linear\.app|github\.com|env\.(?:T3CODE_HOME|T3_SERVER_RUNTIME|T3_DASHBOARD_T3_BIN)\b/,
    allowed: {},
  },
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") ? [relative(SRC, path)] : [];
  });
}

const files = sources(SRC).map((path) => ({ path, text: readFileSync(join(SRC, path), "utf8") }));
const inIntegrations = (path: string) => path.startsWith(`integrations${sep}`);

for (const rule of RULES) {
  test(`${rule.name} happens only in src/integrations/`, () => {
    const offenders = files.filter(({ path, text }) => !inIntegrations(path) && !(path in rule.allowed) && rule.pattern.test(text)).map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });

  // Keeps the rule honest: a pattern that matches nothing would always pass.
  test(`${rule.name} rule matches the integrations that do it`, () => {
    assert.ok(files.some(({ path, text }) => inIntegrations(path) && rule.pattern.test(text)));
  });
}

test("every allowed file still exists and still needs its allowance", () => {
  for (const rule of RULES) {
    for (const path of Object.keys(rule.allowed)) {
      const file = files.find((entry) => entry.path === path);
      assert.ok(file && rule.pattern.test(file.text), `${path} no longer matches "${rule.name}": drop the allowance`);
    }
  }
});

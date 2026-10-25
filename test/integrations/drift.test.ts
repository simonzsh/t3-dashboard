import assert from "node:assert/strict";
import { test } from "bun:test";
import { CheckError, Checks, exitCode, formatReport, type SystemReport } from "../../src/integrations/drift.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";

test("schema issues become breaking findings with array indexes folded and duplicates dropped", () => {
  const checks = new Checks();
  checks.issues("server.getConfig", [
    { path: "providers[0].status", expected: "string", actual: "number" },
    { path: "providers[3].status", expected: "string", actual: "number" },
    { path: "environment", expected: "object", actual: "null" },
  ]);
  assert.deepEqual(checks.report("t3").findings, [
    { level: "breaking", text: "server.getConfig: providers[].status should be string, got number" },
    { level: "breaking", text: "server.getConfig: environment should be object, got null" },
  ]);
});

test("a check that throws is drift only for a protocol error; other errors mean it could not run", async () => {
  const checks = new Checks();
  await checks.run("a", () => {
    throw new IntegrationError("Unexpected T3 ticket: ticket should be string, got undefined", { system: "t3", kind: "protocol" });
  });
  await checks.run("b", () => {
    throw new IntegrationError("connect ECONNREFUSED 127.0.0.1:3773 secret-host", { system: "t3", kind: "unreachable" });
  });
  await checks.run("c", () => {
    throw new IntegrationError("T3 refused the request: some thread title", { system: "t3", kind: "refused", status: 404 });
  });
  await checks.run("d", () => {
    throw new CheckError("no synchronized item within 15 s");
  });
  await checks.run("e", () => {
    throw new TypeError("value secret-value is not a function");
  });
  await checks.run("f", () => {});
  const report = checks.report("t3");
  assert.equal(report.checks, 6);
  assert.deepEqual(report.findings, [
    { level: "breaking", text: "a: Unexpected T3 ticket: ticket should be string, got undefined" },
    { level: "unchecked", text: "b: unreachable" },
    { level: "unchecked", text: "c: refused (HTTP 404)" },
    { level: "unchecked", text: "d: no synchronized item within 15 s" },
    { level: "unchecked", text: "e: failed (TypeError)" },
  ]);
  assert.ok(!JSON.stringify(report).includes("secret"));
});

const ok: SystemReport = { system: "github", checks: 2, findings: [] };
const skipped: SystemReport = { system: "linear", checks: 0, findings: [], skipped: "no Linear key is configured" };
const unchecked: SystemReport = { system: "t3-agent", checks: 1, findings: [{ level: "unchecked", text: "brains: unreadable" }] };
const broken: SystemReport = {
  system: "t3",
  version: "0.1.2",
  checks: 3,
  findings: [
    { level: "unchecked", text: "x: unreachable" },
    { level: "breaking", text: "server.getConfig: providers should be array, got object" },
  ],
};

test("exit code: 1 on a breaking change, else 2 when a check could not run, else 0; a skipped system counts as ok", () => {
  assert.equal(exitCode([ok, skipped]), 0);
  assert.equal(exitCode([ok, unchecked]), 2);
  assert.equal(exitCode([unchecked, broken]), 1);
});

test("the report gives one line per system, then its findings, then the result", () => {
  assert.equal(
    formatReport([broken, skipped, ok, unchecked]),
    [
      "t3 (version 0.1.2): CHANGED, 3 checks",
      "  - breaking: server.getConfig: providers should be array, got object",
      "  - could not run: x: unreachable",
      "linear: SKIPPED, no Linear key is configured",
      "github: OK, 2 checks",
      "t3-agent: COULD NOT RUN, 1 check",
      "  - could not run: brains: unreadable",
      "",
      "Result: breaking change (exit 1)",
    ].join("\n"),
  );
  assert.match(formatReport([ok]), /Result: no change \(exit 0\)$/);
  assert.match(formatReport([unchecked]), /Result: some checks could not run \(exit 2\)$/);
});

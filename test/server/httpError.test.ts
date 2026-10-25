import assert from "node:assert/strict";
import { test } from "bun:test";
import { DomainError } from "../../src/domain/errors.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import { HttpError, toHttp } from "../../src/server/httpError.ts";

const pair = (error: HttpError | null) => error && [error.status, error.message];

test("an HttpError keeps its status and text", () => {
  assert.deepEqual(pair(toHttp(new HttpError(413, "Too big"))), [413, "Too big"]);
});

test("domain errors map to 400, 404 and 409", () => {
  assert.deepEqual(pair(toHttp(new DomainError("invalid", "Bad"))), [400, "Bad"]);
  assert.deepEqual(pair(toHttp(new DomainError("not-found", "Gone"))), [404, "Gone"]);
  assert.deepEqual(pair(toHttp(new DomainError("conflict", "Busy"))), [409, "Busy"]);
});

test("a key Linear refuses is a 400; any other integration failure is a 502", () => {
  assert.deepEqual(pair(toHttp(new IntegrationError("No", { system: "linear", kind: "refused" }))), [400, "No"]);
  assert.deepEqual(pair(toHttp(new IntegrationError("Down", { system: "linear", kind: "unreachable" }))), [502, "Down"]);
  for (const kind of ["unreachable", "refused", "protocol", "not-authenticated"] as const) {
    assert.deepEqual(pair(toHttp(new IntegrationError("T3", { system: "t3", kind }))), [502, "T3"]);
  }
});

test("an unknown error is not mapped: the caller logs it and answers 500", () => {
  assert.equal(toHttp(new Error("boom")), null);
  assert.equal(toHttp("text"), null);
});

import assert from "node:assert/strict";
import { test } from "bun:test";
import { checkPayloads, compareSnapshot, extractShapes, missingTags, type StructSpec } from "../../../src/integrations/t3/bundle.ts";

// Hand-written in the style of the minified T3 client: identifiers are random on purpose.
const BUNDLE = [
  "var Zq=L([`approval-required`,`auto`,`full-access`]),Uv={createdBy:Wq,creationSource:Xq},Wq=L([`user`,`agent`]);",
  "const rx={subscribeShell:`orchestration.subscribeShell`,getConfig:`server.getConfig`};",
  "P({type:A(`run.interrupt`),commandId:gb,threadId:q,runId:bb,reason:k(j),holdQueue:k(N)}),",
  "P({type:A(`thread.create`),...Uv,commandId:gb,threadId:q,title:W.check(by(/^[^}(]+$/)),runtimeMode:Zq,note:k(j),branch:R(W)}),",
  "Qf=P({id:k(Vk),type:A(`image`),name:W,dataUrl:W.check(V(`a{b`))}),",
  "Ef=P({type:A(`image`),url:W}),",
  "P({type:A(`message.dispatch`),commandId:gb,threadId:q,text:j,dispatchMode:I([P({type:A(`queue_after_active`)}),P({type:A(`start_immediately`)})]),deliveryIntent:k(L([`auto`,`steer`]))})",
].join("");

const SPECS: StructSpec[] = [
  { name: "run.interrupt", type: "run.interrupt", marker: "commandId" },
  { name: "thread.create", type: "thread.create", marker: "commandId" },
  { name: "message.dispatch", type: "message.dispatch", marker: "commandId" },
  { name: "image upload", type: "image", marker: "dataUrl" },
  { name: "thread.archive", type: "thread.archive", marker: "commandId" },
];

test("extracts each struct: keys, optional flags, spreads and literal values, and skips strings and regexes", () => {
  const { shapes, missing } = extractShapes(["unrelated();", BUNDLE], SPECS);
  assert.deepEqual(missing, ["thread.archive"]);
  assert.deepEqual(shapes["run.interrupt"], { commandId: "required", threadId: "required", runId: "required", reason: "optional", holdQueue: "optional" });
  assert.deepEqual(shapes["thread.create"], {
    createdBy: "required: agent | user",
    creationSource: "required",
    commandId: "required",
    threadId: "required",
    title: "required",
    runtimeMode: "required: approval-required | auto | full-access",
    note: "optional",
    branch: "required",
  });
  assert.deepEqual(shapes["message.dispatch"], {
    commandId: "required",
    threadId: "required",
    text: "required",
    dispatchMode: "required: queue_after_active | start_immediately",
    deliveryIntent: "optional: auto | steer",
  });
  assert.deepEqual(shapes["image upload"], { id: "optional", name: "required", dataUrl: "required: a{b" });
});

test("another minifier naming gives the same shapes", () => {
  const renamed = BUNDLE.replaceAll("P({", "Ix({").replaceAll("A(`", "Mm(`").replaceAll("k(", "jj(").replaceAll("Zq", "Q$");
  assert.deepEqual(extractShapes([renamed], SPECS), extractShapes([BUNDLE], SPECS));
});

test("without the optional marker of run.interrupt, extraction fails instead of guessing", () => {
  assert.throws(() => extractShapes([BUNDLE.replace("holdQueue:k(N)", "hold:N")], SPECS), /optional wrapper/);
  assert.throws(() => extractShapes(["nothing here"], SPECS), /optional wrapper/);
});

test("a struct that cannot be parsed is reported as failed, not missing", () => {
  const broken = `${BUNDLE};P({type:A(\`thread.delete\`),commandId:gb,threadId:q(`;
  const { failed, missing } = extractShapes([broken], [...SPECS, { name: "thread.delete", type: "thread.delete", marker: "commandId" }]);
  assert.deepEqual(failed, ["thread.delete"]);
  assert.deepEqual(missing, ["thread.archive"]);
});

test("the snapshot diff names added, removed and changed keys, and commands that are new or gone", () => {
  const saved = { "run.interrupt": { runId: "required", reason: "optional" }, "thread.delete": { threadId: "required" } };
  const current = { "run.interrupt": { runId: "optional", holdQueue: "optional" }, "thread.create": { title: "required" } };
  assert.deepEqual(compareSnapshot(saved, current), [
    "run.interrupt.holdQueue: added (optional)",
    "run.interrupt.reason: removed (was optional)",
    "run.interrupt.runId: required, now optional",
    "thread.create: not in the snapshot",
    "thread.delete: no longer in the bundle",
  ]);
  assert.deepEqual(compareSnapshot(current, current), []);
});

test("payload check: an unknown key, a value outside the literals and a required key never sent", () => {
  const shapes = extractShapes([BUNDLE], SPECS).shapes;
  const payloads = {
    "message.dispatch": [
      { type: "message.dispatch", commandId: "c", threadId: "t", text: "secret text", dispatchMode: { type: "start_immediately" } },
      { type: "message.dispatch", commandId: "c", threadId: "t", text: "x", dispatchMode: { type: "steer_now" }, deliveryIntent: "steer", extra: 1 },
    ],
    "run.interrupt": [{ type: "run.interrupt", commandId: "c", threadId: "t", holdQueue: true }],
  };
  assert.deepEqual(checkPayloads(shapes, payloads), [
    "message.dispatch.dispatchMode: a value we send is not in the T3 list",
    "message.dispatch.extra: sent, but T3 does not know it",
    "run.interrupt.runId: required by T3, never sent",
  ]);
});

test("missingTags lists the RPC tags absent from every file", () => {
  assert.deepEqual(missingTags(["a", BUNDLE], ["server.getConfig", "orchestration.subscribeShell", "assets.persistChatAttachments"]), ["assets.persistChatAttachments"]);
});

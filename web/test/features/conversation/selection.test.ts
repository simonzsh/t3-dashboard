import assert from "node:assert/strict";
import { test } from "bun:test";
import { watchSelection } from "../../../src/features/conversation/selection.ts";

const settled = () => new Promise(resolve => setTimeout(resolve, 190));
const fire = (target: EventTarget, type: string, fields: Record<string, unknown> = {}) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, fields);
  target.dispatchEvent(event);
};

function setup(touch = false) {
  const events = new EventTarget();
  const viewport = new EventTarget();
  let visible = false;
  let reads = 0;
  const stop = watchSelection(events, viewport, () => { visible = true; reads++; }, () => { visible = false; }, touch);
  return { events, viewport, stop, visible: () => visible, reads: () => reads };
}

test("Cite stays hidden during a paused drag and appears after release", async () => {
  const s = setup();
  try {
    fire(s.events, "pointerdown");
    fire(s.events, "selectionchange");
    await settled();
    assert.equal(s.visible(), false);
    assert.equal(s.reads(), 0);
    fire(s.events, "pointerup");
    await settled();
    assert.equal(s.visible(), true);
    fire(s.events, "pointerdown");
    assert.equal(s.visible(), false);
  } finally { s.stop(); }
});

test("keyboard selection waits until the selection keys are released", async () => {
  const s = setup();
  try {
    fire(s.events, "keydown", { key: "Shift" });
    fire(s.events, "keydown", { key: "ArrowRight", shiftKey: true });
    fire(s.events, "selectionchange");
    fire(s.events, "keyup", { key: "ArrowRight" });
    await settled();
    assert.equal(s.visible(), false);
    fire(s.events, "keyup", { key: "Shift" });
    await settled();
    assert.equal(s.visible(), true);
  } finally { s.stop(); }
});

test("native selection changes hide Cite until the selection settles", async () => {
  const s = setup();
  try {
    fire(s.events, "selectionchange");
    await settled();
    assert.equal(s.visible(), true);
    fire(s.events, "selectionchange");
    assert.equal(s.visible(), false);
    fire(s.events, "selectionchange");
    await settled();
    assert.equal(s.reads(), 2);
    const cite = new Event("pointerdown", { cancelable: true });
    cite.preventDefault();
    s.events.dispatchEvent(cite);
    assert.equal(s.visible(), true);
  } finally { s.stop(); }
});

test("scroll, cancellation, blur and cleanup cancel a pending citation", async () => {
  for (const type of ["scroll", "resize", "blur", "pointercancel", "cleanup"]) {
    const s = setup();
    try {
      fire(s.events, "selectionchange");
      if (type === "cleanup") s.stop();
      else fire(type === "pointercancel" ? s.events : s.viewport, type);
      await settled();
      assert.equal(s.reads(), 0, type);
      assert.equal(s.visible(), false, type);
    } finally { s.stop(); }
  }
});

test("touch handles can extend selection without sending pointerup", async () => {
  const s = setup(true);
  try {
    fire(s.events, "selectionchange");
    await settled();
    assert.equal(s.visible(), true);
    fire(s.events, "pointerdown");
    fire(s.events, "selectionchange");
    await settled();
    assert.equal(s.visible(), true);
    assert.equal(s.reads(), 2);
  } finally { s.stop(); }
});

test("touch selection is read again after native cancellation and scrolling", async () => {
  const s = setup(true);
  try {
    fire(s.events, "pointerdown");
    fire(s.events, "selectionchange");
    fire(s.events, "pointercancel");
    fire(s.viewport, "scroll");
    await settled();
    assert.equal(s.visible(), true);
    assert.equal(s.reads(), 1);
    fire(s.events, "selectionchange");
    s.stop();
    await settled();
    assert.equal(s.reads(), 1);
  } finally { s.stop(); }
});

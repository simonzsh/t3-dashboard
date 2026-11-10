import assert from "node:assert/strict";
import { test } from "bun:test";
import { animatePanel } from "../../src/ui/panelMotion.ts";

test("panel slides keep the adjacent layout width constant in both directions and on reversal", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
  let reduced = false;
  const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
  const animate = (frames: Keyframe[], options: KeyframeAnimationOptions) => {
    calls.push({ frames, options });
    return {} as Animation;
  };
  try {
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduced }) });
    for (const [from, to] of [[280, 0], [0, 280], [120, 280], [232, 56], [56, 232]]) {
      const panel = { getBoundingClientRect: () => ({ left: 0, width: to }), animate } as unknown as HTMLElement;
      const content = { getBoundingClientRect: () => ({ left: to, width: 1280 - to! }), animate } as unknown as HTMLElement;
      calls.length = 0;
      const before = { panel: { left: 0, width: from! }, content: { left: from!, width: 1280 - from! } };
      assert.equal(animatePanel(panel, content, before).length, 2);
      const edge = calls[0]!;
      const body = calls[1]!;
      for (const frame of edge.frames) {
        assert.equal(parseFloat(String(frame.width)) + parseFloat(String(frame.marginRight)), to);
      }
      assert.equal(parseFloat(String(body.frames[0]!.translate)) + to!, from);
      assert.ok(Math.abs(parseFloat(String(body.frames[0]!.scale)) * (1280 - to!) - (1280 - from!)) < 0.001);
      assert.deepEqual(body.frames[1], { translate: "0 0", scale: "1 1", transformOrigin: "0 0" });
      assert.deepEqual(edge.options, body.options, "the edge and content must stay synchronized");
      assert.equal(edge.options.duration, 240);
      assert.ok(body.frames.every(frame => !("width" in frame)), "content must not reflow each frame");
      reduced = true;
      calls.length = 0;
      assert.deepEqual(animatePanel(panel, content, before), []);
      assert.equal(calls.length, 0);
      reduced = false;
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "matchMedia", original);
    else Reflect.deleteProperty(globalThis, "matchMedia");
  }
});

import assert from "node:assert/strict";
import { test } from "bun:test";
import { observeSessionPanelMotion } from "../../../src/features/sessions/useSessionPanelMotion.ts";

class Box extends EventTarget {
  style = { width: "", flex: "" };
  parentElement: Box | null = null;
  list: Box | null = null;
  target = 0;
  readonly kind: string;
  clientWidth: number;
  constructor(kind: string, width: number) { super(); this.kind = kind; this.clientWidth = width; }
  matches(selector: string) { return selector === this.kind; }
  querySelector() { return this.list; }
  getBoundingClientRect() { return { width: parseFloat(this.style.width) || this.clientWidth }; }
  getAnimations() {
    return [{ transitionProperty: "width", effect: { getKeyframes: () => [{ width: this.clientWidth + "px" }, { width: this.target + "px" }] } }];
  }
}

function fixture(run: (f: {
  area: Box; app: Box; sidebar: Box; list: Box; page: Box;
  emit: (type: string, panel: Box, property?: string) => void;
  finish: () => void; resize: () => void; stop: () => void;
}) => void) {
  const names = ["HTMLElement", "window", "requestAnimationFrame", "cancelAnimationFrame"] as const;
  const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  const win = new EventTarget();
  const globals = {
    HTMLElement: Box, window: win,
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
  };
  const app = new Box(".app", 1280);
  const page = new Box(".sessions", 1048);
  const area = new Box(".sessions-area", 768);
  const sidebar = new Box(".sidebar", 232);
  sidebar.target = 56;
  const list = new Box(".side-panel", 280);
  sidebar.parentElement = app;
  area.parentElement = list.parentElement = page;
  page.list = list;
  let stop = () => {};
  try {
    for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: globals[name] });
    stop = observeSessionPanelMotion(area as unknown as HTMLElement, app as unknown as HTMLElement);
    run({
      area, app, sidebar, list, page, stop,
      emit(type, panel, property = "width") {
        const event = new Event(type);
        Object.defineProperties(event, { target: { value: panel }, propertyName: { value: property } });
        app.dispatchEvent(event);
      },
      finish() {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(fn => fn(0));
      },
      resize() { win.dispatchEvent(new Event("resize")); },
    });
  } finally {
    stop();
    names.forEach((name, i) => {
      if (saved[i]) Object.defineProperty(globalThis, name, saved[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

test("the original panel transition keeps session text at the wider endpoint until completion", () => {
  fixture(({ area, sidebar, emit, finish }) => {
    emit("transitionrun", sidebar, "opacity");
    assert.equal(area.style.width, "");
    emit("transitionrun", sidebar);
    assert.equal(area.style.width, "944px");
    assert.equal(area.style.flex, "none");
    emit("transitionend", sidebar);
    assert.equal(area.style.width, "944px");
    finish();
    assert.equal(area.style.width, "");
    assert.equal(area.style.flex, "");
  });
  fixture(({ area, sidebar, page, emit, finish }) => {
    sidebar.clientWidth = 56;
    sidebar.target = 232;
    page.clientWidth = 1224;
    area.clientWidth = 944;
    emit("transitionrun", sidebar);
    assert.equal(area.style.width, "944px", "opening clips the excess instead of squeezing text");
    emit("transitionend", sidebar);
    finish();
    assert.equal(area.style.width, "");
  });
});

test("reversals and simultaneous panel slides keep the freeze until both panels finish", () => {
  fixture(({ area, sidebar, list, emit, finish }) => {
    emit("transitionrun", sidebar);
    emit("transitioncancel", sidebar);
    sidebar.clientWidth = 130;
    sidebar.target = 232;
    emit("transitionrun", sidebar);
    finish();
    assert.equal(area.style.width, "944px", "a reversal must cancel the pending restore");
    list.target = 0;
    emit("transitionrun", list);
    assert.ok(parseFloat(area.style.width) >= 944);
    emit("transitionend", sidebar);
    finish();
    assert.equal(area.style.flex, "none");
    emit("transitionend", list);
    finish();
    assert.equal(area.style.width, "");
  });
});

test("window resize and cleanup restore normal layout; unrelated panels are ignored", () => {
  fixture(({ area, sidebar, emit, resize, stop, finish }) => {
    emit("transitionrun", new Box(".side-panel", 300));
    assert.equal(area.style.width, "");
    emit("transitionrun", sidebar);
    resize();
    assert.equal(area.style.width, "");
    emit("transitionrun", sidebar);
    emit("transitioncancel", sidebar);
    stop();
    finish();
    assert.equal(area.style.width, "");
    emit("transitionrun", sidebar);
    assert.equal(area.style.width, "", "cleanup removes listeners");
  });
});

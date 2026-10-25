import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { nextRadioIndex } from "../../src/ui/radioKeys.ts";
import { Badge, Button, Choice, Dialog, Segmented, FileInput, Icon, IconButton, Pressable, SecretInput, TextArea, TextInput } from "../../src/ui/index.ts";

const html = renderToStaticMarkup;

test("a Button is a secondary md button of type button by default", () => {
  assert.equal(html(<Button>Save</Button>), '<button type="button" class="btn md">Save</button>');
});

test("a Button takes a variant, a size and extra classes", () => {
  assert.equal(html(<Button variant="primary" size="sm" className="wide">Go</Button>), '<button type="button" class="btn sm primary wide">Go</button>');
});

test("a Button shows its shortcut in a kbd after the label", () => {
  assert.equal(html(<Button kbd="N">New</Button>), '<button type="button" class="btn md">New<kbd>N</kbd></button>');
});

test("a loading Button is disabled and busy, and shows the loading text", () => {
  const out = html(<Button loading="Saving…">Save</Button>);
  assert.match(out, /disabled=""/);
  assert.match(out, /aria-busy="true"/);
  assert.match(out, />Saving…<\/button>$/);
  assert.match(html(<Button loading>Save</Button>), />Save<\/button>$/);
});

test("an IconButton names itself with its label", () => {
  const out = html(<IconButton label="Close"><Icon name="x" /></IconButton>);
  assert.match(out, /^<button type="button" aria-label="Close" data-tooltip="Close" class="icon-button md"><svg class="icon"/);
});

test("an IconButton takes a tooltip and a shortcut apart from its label", () => {
  const out = html(<IconButton label="Settings" tooltip="Open settings" shortcut="," size="sm" kbd=",">S</IconButton>);
  assert.match(out, /aria-label="Settings" data-tooltip="Open settings" data-shortcut="," class="icon-button sm"/);
  assert.match(out, />S<kbd>,<\/kbd><\/button>$/);
});

test("Button and Pressable map tooltip and shortcut to data attributes, never to title", () => {
  assert.equal(html(<Button tooltip="New Agent" shortcut="N">New</Button>), '<button type="button" data-tooltip="New Agent" data-shortcut="N" class="btn md">New</button>');
  assert.equal(html(<Pressable tooltip="Tab" shortcut="1">T</Pressable>), '<button type="button" data-tooltip="Tab" data-shortcut="1">T</button>');
});

test("a Pressable is a plain button for cards, rows and tabs", () => {
  assert.equal(html(<Pressable className="agent">Card</Pressable>), '<button type="button" class="agent">Card</button>');
});

const AUTOFILL_OFF = /autoComplete="off"|autocomplete="off"/;

test("a TextInput is a text field with autofill off", () => {
  const out = html(<TextInput placeholder="Filter…" />);
  assert.match(out, /^<input /);
  assert.match(out, AUTOFILL_OFF);
  assert.match(out, /data-1p-ignore=""/);
  assert.match(out, /data-lpignore="true"/);
  assert.match(out, /type="text"/);
  assert.match(out, /class="field"/);
});

test("a TextArea has autofill off", () => {
  const out = html(<TextArea className="big" />);
  assert.match(out, /^<textarea /);
  assert.match(out, AUTOFILL_OFF);
  assert.match(out, /class="field big"/);
});

test("a SecretInput is a masked text field, never a password field", () => {
  const out = html(<SecretInput aria-label="Key" />);
  assert.match(out, /type="text"/);
  assert.doesNotMatch(out, /password/);
  assert.match(out, AUTOFILL_OFF);
  assert.match(out, /class="field secret-field"/);
  assert.match(out, /spellCheck="false"|spellcheck="false"/);
});

test("a Choice is a checkbox or a radio", () => {
  assert.equal(html(<Choice type="checkbox" disabled checked />), '<input type="checkbox" disabled="" checked=""/>');
  assert.match(html(<Choice type="radio" name="q" />), /^<input type="radio" name="q"\/>$/);
});

test("a FileInput is a hidden file field", () => {
  assert.equal(html(<FileInput accept="image/*" onFiles={() => {}} />), '<input type="file" hidden="" accept="image/*"/>');
});

test("a Dialog has a title, a close button and the dialog role", () => {
  const out = html(<Dialog title="Settings" onClose={() => {}}><p>Body</p></Dialog>);
  assert.match(out, /role="dialog" aria-modal="true" aria-labelledby="[^"]+"/);
  assert.match(out, /<h2 id="[^"]+">Settings<\/h2>/);
  assert.match(out, /aria-label="Close" data-tooltip="Close" data-shortcut="Esc"/);
  assert.match(out, /<p>Body<\/p>/);
  assert.doesNotMatch(out, /dialog-actions/);
});

test("a Dialog puts Cancel on the left and the primary action on the right", () => {
  const out = html(<Dialog title="Update?" label="Update" onClose={() => {}} onCancel={() => {}} primary={{ label: "Update", onClick: () => {} }} />);
  assert.match(out, /aria-label="Update"/);
  const actions = out.slice(out.indexOf("dialog-actions"));
  const cancel = actions.indexOf(">Cancel<");
  const primary = actions.indexOf('class="btn md primary"');
  assert.ok(cancel > 0 && primary > cancel, actions);
});

test("a Dialog primary action can be disabled and the Cancel label changed", () => {
  const out = html(<Dialog title="T" onClose={() => {}} onCancel={() => {}} cancelLabel="Not now" primary={{ label: "Go", onClick: () => {}, disabled: true }} />);
  assert.match(out, />Not now</);
  assert.match(out, /class="btn md primary" disabled="">Go</);
});

test("a Badge shows a state colour", () => {
  assert.equal(html(<Badge variant="running">Running</Badge>), '<span class="badge running">Running</span>');
  assert.equal(html(<Badge>Pinned</Badge>), '<span class="badge neutral">Pinned</span>');
});

test("a Segmented control is a radio group with the active option checked", () => {
  const out = html(<Segmented label="Theme" value="dark" options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} onChange={() => {}} />);
  assert.match(out, /^<div class="segmented" role="radiogroup" aria-label="Theme">/);
  assert.match(out, /role="radio" aria-checked="false" tabindex="-1" class="">Light</);
  assert.match(out, /role="radio" aria-checked="true" tabindex="0" class="active">Dark</);
});

test("a Dialog without label is named by its title and a Segmented has one tab stop", () => {
  const d = html(<Dialog title="Settings" onClose={() => {}} />);
  const id = d.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(id && d.includes(`<h2 id="${id}">`));
  assert.match(html(<Dialog title="T" label="Named" onClose={() => {}} />), /aria-label="Named"/);
  const seg = html(<Segmented label="L" value="b" options={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} onChange={() => {}} />);
  assert.equal(seg.match(/tabindex="0"/g)?.length, 1);
  assert.equal(seg.match(/tabindex="-1"/g)?.length, 1);
});

test("arrow keys move the radio selection and wrap", () => {
  assert.equal(nextRadioIndex("ArrowRight", 2, 3), 0);
  assert.equal(nextRadioIndex("ArrowLeft", 0, 3), 2);
  assert.equal(nextRadioIndex("ArrowDown", 0, 3), 1);
  assert.equal(nextRadioIndex("a", 0, 3), null);
});

test("an Icon is hidden from assistive tech, unless it has a label", () => {
  assert.match(html(<Icon name="x" />), /^<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">/);
  assert.match(html(<Icon name="terminal" label="Done" />), /^<svg class="icon" viewBox="0 0 24 24" role="img" aria-label="Done"><title>Done<\/title>/);
});

test("solid icon parts are filled, not stroked", () => {
  const out = html(<Icon name="stop" />);
  assert.match(out, /fill="currentColor"/);
  assert.doesNotMatch(out, /stroke="currentColor"/);
});

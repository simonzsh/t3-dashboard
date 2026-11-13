import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { nextRadioIndex, rovingTabIndex } from "../../src/ui/radioKeys.ts";
import { isPhone, isTouch, PHONE, TOUCH } from "../../src/ui/media.ts";
import { ActionMenuRow } from "../../src/ui/ActionMenu.tsx";
import { ActionMenu, Badge, Button, ButtonLink, Chevron, Choice, CountBadge, Dialog, IconButtonLink, Kbd, ListPage, ListToolbar, OptionList, SearchField, Segmented, FileInput, Icon, IconButton, PageHeader, Pressable, SecretInput, Sheet, Skeleton, SkeletonGroup, Switch, Tabs, TextArea, TextInput, Tree, SidePanel, SidePanelToggle } from "../../src/ui/index.ts";
import { pathTree } from "../../src/ui/pathTree.ts";

const html = renderToStaticMarkup;

test("a disabled Segmented removes every option from keyboard navigation", () => {
  const out = html(<Segmented label="Channel" value="main" options={[{ id: "stable", label: "Stable" }, { id: "main", label: "Main" }]} disabled onChange={() => {}} />);
  assert.match(out, /aria-disabled="true"/);
  assert.equal(out.match(/disabled="" tabindex="-1"/g)?.length, 2);
});

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

test("an IconButton names itself with its label and has no tooltip unless asked", () => {
  const out = html(<IconButton label="Close"><Icon name="x" /></IconButton>);
  assert.match(out, /^<button type="button" aria-label="Close" class="icon-button md"><svg class="icon"/);
  assert.doesNotMatch(html(<IconButton label="Close" shortcut="X">x</IconButton>), /data-shortcut/);
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
  assert.match(out, /aria-label="Close"/);
  assert.doesNotMatch(out, /data-tooltip/);
  assert.match(out, /<p>Body<\/p>/);
  assert.doesNotMatch(out, /dialog-actions/);
});

test("a hidden Dialog stays in the page, out of sight", () => {
  assert.match(html(<Dialog title="T" onClose={() => {}} hidden><p>Body</p></Dialog>), /class="dialog-backdrop" hidden=""/);
  assert.match(html(<Dialog title="T" onClose={() => {}} />), /<div class="dialog-backdrop"><div/);
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

test("a danger primary action uses the danger button", () => {
  const out = html(<Dialog title="T" onClose={() => {}} onCancel={() => {}} primary={{ label: "Delete", onClick: () => {}, danger: true }} />);
  assert.match(out, /class="btn md danger">Delete</);
  assert.doesNotMatch(out, /class="btn md primary"/);
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
  assert.match(html(<Icon name="terminal" label="Done" />), /^<svg class="icon" viewBox="0 0 24 24" role="img" aria-label="Done"><path/);
});

test("solid icon parts are filled, not stroked", () => {
  const out = html(<Icon name="stop" />);
  assert.match(out, /fill="currentColor"/);
  assert.doesNotMatch(out, /stroke="currentColor"/);
});

test("Tabs is a tab list with the active tab selected and the only tab stop", () => {
  const out = html(<Tabs label="Sections" idPrefix="s" value="b" options={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} onChange={() => {}} />);
  assert.match(out, /role="tablist" aria-label="Sections"/);
  assert.match(out, /role="tab" id="s-a" aria-selected="false" aria-controls="s-panel" tabindex="-1"/);
  assert.match(out, /role="tab" id="s-b" aria-selected="true" aria-controls="s-panel" tabindex="0" class="active"/);
});

test("the shell icons exist and draw a path", () => {
  for (const name of ["messagesSquare", "layoutPanels", "house", "panelLeft", "chart"] as const) assert.match(html(<Icon name={name} />), /<path d="/, name);
});

test("a PageHeader is a header with a title, a description and its actions", () => {
  const out = html(<PageHeader title="Dashboard" description="Usage and agents." actions={<Button>New</Button>} />);
  assert.match(out, /^<header class="page-header">/);
  assert.match(out, /<h1 class="page-title">Dashboard<\/h1>/);
  assert.match(out, /<p class="page-description">Usage and agents\.<\/p>/);
  assert.match(out, /<div class="page-actions"><button/);
});

test("a PageHeader shows its leading element first and no empty actions", () => {
  const out = html(<PageHeader title="Sessions" description="x" leading={<i id="logo" />} />);
  assert.ok(out.indexOf('id="logo"') < out.indexOf("<h1"));
  assert.doesNotMatch(out, /page-actions/);
});

test("a Skeleton is an aria-hidden block of the given size", () => {
  const out = html(<Skeleton width={40} height="2rem" radius="50%" />);
  assert.match(out, /class="skeleton"/);
  assert.match(out, /aria-hidden="true"/);
  assert.match(out, /width:40px;height:2rem;border-radius:50%/);
});

test("a SkeletonGroup is one busy, labelled region", () => {
  assert.match(html(<SkeletonGroup label="Loading usage"><Skeleton /></SkeletonGroup>), /role="status" aria-busy="true" aria-label="Loading usage"/);
});

test("a Switch is a named switch button that shows its state", () => {
  const on = html(<Switch checked label="Pause Inbox" onChange={() => {}} />);
  assert.match(on, /role="switch"/);
  assert.match(on, /aria-checked="true"/);
  assert.match(on, /aria-label="Pause Inbox"/);
  assert.match(html(<Switch checked={false} label="x" onChange={() => {}} disabled />), /aria-checked="false"[^>]*disabled=""|disabled=""[^>]*aria-checked="false"/);
});

test("a closed Sheet stays mounted, inert and without the open class", () => {
  const out = html(<Sheet open={false} label="Notifications" onClose={() => {}}>x</Sheet>);
  assert.match(out, /class="ui-sheet-backdrop"/);
  assert.match(out, /class="ui-sheet narrow"/);
  assert.match(out, / inert=""/);
});

test("an open Sheet is a labelled modal dialog with the width class", () => {
  const out = html(<Sheet open width="wide" label="Inbox triage" onClose={() => {}}>x</Sheet>);
  assert.match(out, /class="ui-sheet wide open" role="dialog" aria-modal="true" aria-label="Inbox triage"/);
  assert.doesNotMatch(out, /inert/);
});

test("an ActionMenu is a closed menu button with the given name", () => {
  const out = html(<ActionMenu label="Actions for X" tooltip="Actions" items={[{ label: "Edit", icon: "pencil", onSelect: () => {} }]} />);
  assert.match(out, /aria-label="Actions for X"/);
  assert.match(out, /aria-haspopup="menu"/);
  assert.match(out, /aria-expanded="false"/);
  assert.doesNotMatch(out, /role="menu"/);
});

test("an ActionMenu row shows the unread ring only for an unread item", () => {
  const row = (unread?: boolean) => html(<ActionMenuRow item={{ label: "#12 repo", icon: "gitPullRequest", onSelect: () => {}, unread }} id="r" active={false} onPick={() => {}} onHover={() => {}} />);
  assert.match(row(true), /<span class="dropdown-text">#12 repo<\/span><span class="notif-dot" role="img" aria-label="Unread"><\/span>/);
  assert.doesNotMatch(row(), /notif-dot/);
  assert.doesNotMatch(row(false), /notif-dot/);
});

test("an ActionMenu row cuts only its detail: the label and the unread ring stay whole", () => {
  const title = "A very long pull request title ".repeat(8).trim();
  const out = html(<ActionMenuRow item={{ label: "#12 acme/storefront", detail: title, icon: "gitPullRequest", onSelect: () => {}, unread: true }} id="r" active={false} onPick={() => {}} onHover={() => {}} />);
  assert.match(out, /<span class="action-menu-label">#12 acme\/storefront<\/span>/);
  assert.match(out, new RegExp(`<span class="action-menu-detail" data-tooltip="${title}" data-tooltip-clipped="">– ${title}</span>`));
  assert.match(out, /<\/span><\/span><span class="notif-dot" role="img" aria-label="Unread"><\/span><\/div>$/);
});

test("a waiting badge carries a hollow diamond and an error badge the alert circle; others carry none", () => {
  const html = (variant: "waiting" | "error" | "done") => renderToStaticMarkup(<Badge variant={variant}>x</Badge>);
  assert.match(html("waiting"), /badge-icon/);
  assert.match(html("waiting"), /d="M12 3 21 12 12 21 3 12Z" fill="none" stroke="currentColor"/);
  assert.match(html("error"), /badge-icon/);
  assert.doesNotMatch(html("done"), /badge-icon/);
});

const rows = ["Alpha", "Beta"];
const list = (props: Partial<Parameters<typeof OptionList<string>>[0]> = {}) =>
  html(
    <OptionList id="l" label="Files" items={rows} active={1} itemId={(i) => `o-${i}`} itemKey={(r) => r} onHover={() => {}} onPick={() => {}} {...props}>
      {(r) => <span>{r}</span>}
    </OptionList>,
  );

test("an OptionList is a listbox of option rows with ids, and the active row is selected", () => {
  const out = list();
  assert.match(out, /^<div id="l" role="listbox" aria-label="Files" class="dropdown-list">/);
  assert.match(out, /<div id="o-0" role="option" aria-selected="false" class="dropdown-option">/);
  assert.match(out, /<div id="o-1" role="option" aria-selected="true" class="dropdown-option active">/);
});

test("an OptionList rows are plain divs: no button, no tab stop", () => {
  assert.doesNotMatch(list(), /<button|tabindex/);
});

test("an OptionList takes isSelected, extra classes and an empty text", () => {
  const out = list({ isSelected: (r) => r === "Alpha", className: "folder-list", optionClassName: "tall" });
  assert.match(out, /class="dropdown-list folder-list"/);
  assert.match(out, /id="o-0" role="option" aria-selected="true" class="dropdown-option tall"/);
  assert.match(out, /id="o-1" role="option" aria-selected="false" class="dropdown-option active tall"/);
  assert.match(list({ items: [], empty: <i>None</i> }), /<i>None<\/i>/);
  assert.doesNotMatch(list({ items: [] }), /<i>/);
});

test("a CountBadge hides at zero and caps at max", () => {
  assert.equal(html(<CountBadge count={0} />), "");
  assert.equal(html(<CountBadge count={3} />), '<span class="count-badge">3</span>');
  assert.match(html(<CountBadge count={10} max={9} />), />9\+</);
  assert.match(html(<CountBadge count={100} />), />99\+</);
  assert.match(html(<CountBadge count={99} />), />99</);
});

test("a CountBadge with a label is an image, and a hidden one is out of the accessibility tree", () => {
  assert.match(html(<CountBadge count={2} label="2 unread" />), /role="img" aria-label="2 unread"/);
  assert.match(html(<CountBadge count={2} hidden />), /aria-hidden="true"/);
});

test("a SearchField wraps an icon and a field; className is on the wrapper", () => {
  const out = html(<SearchField className="x-search" aria-label="Find" />);
  assert.match(out, /^<div class="search-field x-search"><svg/);
  assert.match(out, /<input[^>]*aria-label="Find"[^>]*class="field"/);
});

test("a ButtonLink is an anchor with the Button classes", () => {
  assert.equal(html(<ButtonLink href="/x" download="a">Get</ButtonLink>), '<a href="/x" download="a" class="btn md">Get</a>');
  assert.match(html(<ButtonLink href="/x" variant="primary" size="sm" tooltip="Hi">Go</ButtonLink>), /data-tooltip="Hi" class="btn sm primary"/);
});

test("an IconButtonLink names itself with its label", () => {
  const out = html(<IconButtonLink href="/x" label="Open" variant="ghost" size="sm"><Icon name="x" /></IconButtonLink>);
  assert.match(out, /^<a href="\/x" aria-label="Open" class="icon-button sm ghost">/);
});

test("a Kbd has no class attribute unless asked", () => {
  assert.equal(html(<Kbd>N</Kbd>), "<kbd>N</kbd>");
  assert.equal(html(<Kbd className="key">N</Kbd>), '<kbd class="key">N</kbd>');
});

test("a Chevron points right when closed and down when open; opensUp flips it", () => {
  assert.match(html(<Chevron open={false} />), /class="icon disclosure"/);
  assert.match(html(<Chevron open />), /class="icon disclosure open"/);
  assert.match(html(<Chevron open={false} opensUp />), /class="icon disclosure up"/);
  assert.match(html(<Chevron open opensUp className="x" />), /class="icon disclosure up open x"/);
});

test("a radio group has one tab stop: the checked radio, or the first when none is checked", () => {
  assert.equal(rovingTabIndex(true, false, true), 0);
  assert.equal(rovingTabIndex(false, true, true), -1);
  assert.equal(rovingTabIndex(false, false, true), -1);
  assert.equal(rovingTabIndex(false, true, false), 0);
  assert.equal(rovingTabIndex(false, false, false), -1);
});

test("media checks are false without matchMedia and name the shared queries", () => {
  assert.equal(isPhone(), false);
  assert.equal(isTouch(), false);
  assert.equal(PHONE, "(max-width: 700px)");
  assert.equal(TOUCH, "(pointer: coarse)");
});

test("a ListToolbar puts its search field first, labelled, then the page's filters and actions", () => {
  const onChange = () => {};
  const out = html(<ListToolbar search={{ label: "Search things", value: "a", onChange }}><button>Sort</button></ListToolbar>);
  assert.match(out, /^<div class="list-toolbar"><div class="search-field list-toolbar-search"><svg[\s\S]*<input[^>]*aria-label="Search things"[^>]*placeholder="Search things…"[^>]*value="a"[\s\S]*<\/div><button>Sort<\/button><\/div>$/);
  assert.match(html(<ListToolbar wrap={false} search={{ label: "Search", value: "", onChange }} />), /^<div class="list-toolbar no-wrap">/);
});

test("a flush ListPage marks itself, so its head-to-body space scrolls with the body", () => {
  assert.match(html(<ListPage head="h" flush><ul /></ListPage>), /^<section class="list-page flush">/);
});

test("a bleed ListPage marks its body, so it runs edge to edge on a phone", () => {
  assert.match(html(<ListPage head="h" bleed><ul /></ListPage>), /<div class="list-page-body page-scroll bleed"><ul><\/ul><\/div>/);
});

test("a ListPage with a body ref renders the same markup", () => {
  assert.equal(html(<ListPage head="h" bodyRef={{ current: null }}><ul /></ListPage>), '<section class="list-page"><div class="list-page-head">h</div><div class="list-page-body page-scroll"><ul></ul></div></section>');
});

test("a ListPage puts its head before, and outside, the scrolling body", () => {
  assert.equal(
    html(
      <ListPage className="x-page" aria-label="Things" headClassName="x-head" bodyClassName="x-body" head={<span>tools</span>}>
        <ul />
      </ListPage>,
    ),
    '<section class="list-page x-page" aria-label="Things"><div class="list-page-head x-head"><span>tools</span></div><div class="list-page-body page-scroll x-body"><ul></ul></div></section>',
  );
});

test("an IconButtonLink has no text padding, so it keeps the size of an IconButton", async () => {
  const css = await Bun.file(new URL("../../src/styles.css", import.meta.url)).text();
  assert.match(css, /^\.icon-button, a\.icon-button \{ padding: 0;/m);
});

test("a Tree shows open folders with a chevron, files with an icon, and marks the current file", () => {
  const nodes = pathTree(["src/a.ts", "src/b.ts", "README.md"], (p) => p.split("/"), (p) => p);
  const out = html(<Tree<string, (typeof nodes)[number]> nodes={nodes} active="src/b.ts" onPick={() => {}} icon={(p) => (p.endsWith(".md") ? "info" : "fileText")} rowClass={(p) => (p === "src/a.ts" ? "dim" : "")} rowLabel={(p) => `file ${p}`} extra={(node) => node.item && <i>x</i>} />);
  assert.match(out, /^<ul class="ui-tree"><li><button type="button" class="ui-tree-row" style="padding-left:8px" aria-expanded="true">/);
  assert.match(out, /<span class="ui-tree-name" data-tooltip="src" data-tooltip-clipped="true">src<\/span><\/button><ul class="ui-tree">/);
  assert.match(out, /class="ui-tree-row dim" style="padding-left:22px" aria-label="file src\/a.ts"/);
  assert.match(out, /class="ui-tree-row active" style="padding-left:22px" aria-current="true" aria-label="file src\/b.ts"/);
  assert.equal(out.match(/<i>x<\/i>/g)?.length, 3);
});

test("a SidePanel stays mounted when hidden, inert, and its toggle names the next action", () => {
  assert.equal(html(<SidePanel hidden={false} className="x"><i /></SidePanel>), '<div class="side-panel x"><i></i></div>');
  assert.match(html(<SidePanel hidden><i /></SidePanel>), /^<div class="side-panel hidden" inert=""><i><\/i><\/div>$/);
  assert.match(html(<SidePanelToggle hidden show="Show files" hide="Hide files" size="sm" onToggle={() => {}} />), /aria-label="Show files" data-tooltip="Show files" class="icon-button sm ghost"/);
  assert.match(html(<SidePanelToggle hidden={false} show="Show files" hide="Hide files" onToggle={() => {}} />), /aria-label="Hide files"/);
});

test("underline Tabs mark the bar, and an option can carry an icon and a count", () => {
  const out = html(<Tabs label="Page" idPrefix="t" value="b" variant="underline" options={[{ id: "a", label: "A", icon: "fileText" }, { id: "b", label: "B", count: 8 }]} onChange={() => {}} />);
  assert.match(out, /^<div class="tabs underline" role="tablist" aria-label="Page">/);
  assert.match(out, /id="t-a" aria-selected="false"[^>]*><svg class="icon"[^>]*>.*?<\/svg>A<\/button>/);
  assert.match(out, /id="t-b" aria-selected="true"[^>]*class="active">B<span class="tabs-count">8<\/span><\/button>/);
  assert.match(html(<Tabs label="P" idPrefix="p" value="a" options={[{ id: "a", label: "A" }]} onChange={() => {}} />), /^<div class="tabs" role="tablist"/);
});

test("menu status icons keep their color and accessible name", () => {
  const out = html(<ActionMenuRow item={{ label: "#12 repo", icon: "gitMerge", iconClassName: "pr-status-merged", iconLabel: "Merged", onSelect: () => {} }} id="status" active={false} onPick={() => {}} onHover={() => {}} />);
  assert.match(out, /class="icon pr-status-merged"/);
  assert.match(out, /aria-label="Merged"/);
});

test("menu trigger supports a named status icon without coloring its count", () => {
  const out = html(<ActionMenu label="Pull requests" icon="gitMerge" iconClassName="pr-status-merged" iconLabel="Merged" count={2} items={[]} />);
  assert.match(out, /class="icon pr-status-merged"/);
  assert.match(out, /aria-label="Merged"/);
  assert.match(out, /count-badge/);
});

test("neutral count badges support visible zero without changing default badges", () => {
  assert.equal(html(<CountBadge count={0} tone="neutral" showZero />), '<span class="count-badge neutral">0</span>');
  assert.equal(html(<CountBadge count={0} tone="neutral" />), "");
  assert.match(html(<CountBadge count={120} tone="neutral" max={Infinity} />), />120</);
});

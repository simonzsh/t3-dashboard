import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationMark, AutomationThreadsContext } from "../../src/lib/automationThreads.tsx";

const render = (ids: string[], id: string) =>
  renderToStaticMarkup(
    <AutomationThreadsContext.Provider value={new Set(ids)}>
      <AutomationMark id={id} />
    </AutomationThreadsContext.Provider>,
  );

test("the mark shows for a thread of an automation, with a name for assistive tech", () => {
  const out = render(["run-1"], "run-1");
  assert.match(out, /auto-mark/);
  assert.match(out, /aria-label="Automation"/);
  assert.match(out, /data-tooltip="Automation"/);
});

test("the mark does not show for another thread", () => {
  assert.equal(render(["run-1"], "chat-1"), "");
});

test("without a provider no thread is marked", () => {
  assert.equal(renderToStaticMarkup(<AutomationMark id="run-1" />), "");
});

import { useState } from "react";
import type { RunChange } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { Loader, Pressable } from "../../ui/index.ts";
import { fileSection, limitLines } from "./runDiff.ts";

type Diff = { state: "idle" | "loading" } | { state: "ready"; text: string } | { state: "error"; message: string };

const lineClass = (line: string) => (line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : undefined);

function FileDiff({ path, diff }: { path: string; diff: Diff }) {
  if (diff.state === "error") return <p className="error">{diff.message}</p>;
  if (diff.state !== "ready") return <Loader />;
  const section = fileSection(diff.text, path);
  if (!section) return <p className="empty">No diff for this file</p>;
  const { shown, hidden } = limitLines(section);
  return (
    <pre className="run-diff">
      {shown.map((line, i) => (
        <span key={i} className={lineClass(line)}>
          {line}
        </span>
      ))}
      {hidden > 0 && <span className="hunk">… {hidden} more lines</span>}
    </pre>
  );
}

interface Props {
  threadId: string;
  ordinal: number;
  changes: RunChange[];
}

export function RunChanges({ threadId, ordinal, changes }: Props) {
  const api = useApi();
  const [open, setOpen] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff>({ state: "idle" });

  // The diff of all files comes in one call; the api caches it, so a second row does not fetch again.
  const toggle = (path: string) => {
    setOpen(open === path ? null : path);
    // An error row retries on the next click; the api dropped the failed call from its cache.
    if (diff.state === "loading" || diff.state === "ready") return;
    setDiff({ state: "loading" });
    api.getRunDiff(threadId, ordinal).then(
      ({ diff: text }) => setDiff({ state: "ready", text }),
      (error: Error) => setDiff({ state: "error", message: error.message }),
    );
  };

  return (
    <div className="run-changes">
      <span className="run-changes-title">Changes</span>
      <ul>
        {changes.map((change) => (
          <li key={change.path}>
            <Pressable className="run-change" aria-expanded={open === change.path} onClick={() => toggle(change.path)}>
              <span className="run-change-path" data-tooltip={change.path} data-tooltip-clipped>
                {change.path}
              </span>
              {change.kind !== "modified" && <span className="run-change-kind">{change.kind}</span>}
              <span className="run-change-add">+{change.additions}</span>
              <span className="run-change-del">-{change.deletions}</span>
              <span className={`chevron${open === change.path ? " open" : ""}`} aria-hidden="true" />
            </Pressable>
            {open === change.path && <FileDiff path={change.path} diff={diff} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

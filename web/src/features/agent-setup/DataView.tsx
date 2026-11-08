import { useState } from "react";
import type { JsonValue } from "../../../../shared/api.ts";
import { Chevron, Icon, Pressable } from "../../ui/index.ts";
import { isMasked } from "./setupTree.ts";

/** A masked value keeps its text and gets a lock: the server already replaced the secret. */
export function ValueText({ text }: { text: string }) {
  return (
    <span className="as-value">
      {isMasked(text) && <Icon name="lock" className="icon as-lock" />}
      {text}
    </span>
  );
}

const isBranch = (value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } => typeof value === "object" && value !== null;

const summary = (value: JsonValue[] | { [key: string]: JsonValue }): string => (Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`);

function Node({ name, value, depth }: { name: string; value: JsonValue; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  if (!isBranch(value)) {
    return (
      <li className="as-data-row">
        <span className="as-key">{name}</span>
        <ValueText text={typeof value === "string" ? value : String(value)} />
      </li>
    );
  }
  const entries = Object.entries(value);
  return (
    <li>
      <Pressable className="as-data-row as-branch" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <span className="as-key">{name}</span>
        <span className="as-muted">{summary(value)}</span>
      </Pressable>
      {open && entries.length > 0 && (
        <ul className="as-data">
          {entries.map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A collapsible key and value tree of parsed, masked JSON or TOML. */
export function DataView({ value }: { value: JsonValue }) {
  if (!isBranch(value)) return <ValueText text={String(value)} />;
  return (
    <ul className="as-data root">
      {Object.entries(value).map(([k, v]) => (
        <Node key={k} name={k} value={v} depth={0} />
      ))}
    </ul>
  );
}

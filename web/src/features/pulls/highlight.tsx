import { createElement, type ReactNode } from "react";
import type { DiffHunk } from "../../../../shared/diff.ts";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

interface HNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: HNode[];
}

// Flatten the tree into lines: a token spanning several lines is cloned on each one, keeping its class.
function splitLines(nodes: HNode[]): HNode[][] {
  const lines: HNode[][] = [[]];
  const walk = (node: HNode, wrap: HNode[]) => {
    if (node.type === "text") {
      node.value?.split("\n").forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (!part) return;
        let leaf: HNode = { type: "text", value: part };
        for (const w of wrap.toReversed()) leaf = { ...w, children: [leaf] };
        lines[lines.length - 1]!.push(leaf);
      });
    } else if (node.type === "element") {
      for (const child of node.children ?? []) walk(child, [...wrap, node]);
    }
  };
  nodes.forEach((node) => walk(node, []));
  return lines;
}

function renderHast(node: HNode, key: number): ReactNode {
  if (node.type === "text") return node.value;
  const className = node.properties?.className?.join(" ");
  return createElement(node.tagName ?? "span", { key, className }, ...(node.children ?? []).map(renderHast));
}

// Highlights the whole block so multi-line tokens (comments, strings) stay coloured on every line.
export function highlightLines(code: string, lang: string | undefined): ReactNode[][] {
  const plain = code.split("\n");
  const fallback = plain.map((line) => [line]);
  if (!lang) return fallback;
  try {
    const tree = lowlight.highlight(lang, code) as unknown as { children: HNode[] };
    const lines = splitLines(tree.children);
    if (lines.length !== plain.length) return fallback;
    return lines.map((line) => line.map(renderHast));
  } catch {
    return fallback;
  }
}

// Highlighted rows per hunk, kept while the diff lives: collapsing and reopening a file does not highlight it again.
const highlighted = new WeakMap<DiffHunk, ReactNode[]>();

// Old side (context + del) and new side (context + add) are highlighted as two blocks, then mapped back per line.
export function highlightHunk(hunk: DiffHunk, lang: string): ReactNode[] {
  const cached = highlighted.get(hunk);
  if (cached) return cached;
  const oldText: string[] = [];
  const newText: string[] = [];
  // Index of each line within the block of the side it is shown from.
  const pos = hunk.lines.map((line) => {
    if (line.kind !== "add") oldText.push(line.text);
    if (line.kind !== "del") newText.push(line.text);
    return (line.kind === "del" ? oldText : newText).length - 1;
  });
  const oldHl = highlightLines(oldText.join("\n"), lang);
  const newHl = highlightLines(newText.join("\n"), lang);
  const rows = hunk.lines.map((line, i) => (line.kind === "del" ? oldHl[pos[i]!] : newHl[pos[i]!]));
  highlighted.set(hunk, rows);
  return rows;
}

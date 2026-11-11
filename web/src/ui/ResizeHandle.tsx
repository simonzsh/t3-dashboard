import { useRef } from "react";
import { Pressable } from "./Pressable.tsx";

export function ResizeHandle({ axis, label, onDelta, onReset }: { axis: "x" | "y"; label: string; onDelta: (delta: number) => void; onReset: () => void }) {
  const previous = useRef<number | null>(null);
  return <Pressable className={`resize-handle resize-handle-${axis}`} aria-label={label}
    onDoubleClick={onReset}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      previous.current = axis === "x" ? event.clientX : event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (previous.current === null) return;
      const next = axis === "x" ? event.clientX : event.clientY;
      onDelta(next - previous.current);
      previous.current = next;
    }}
    onPointerUp={(event) => { previous.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { previous.current = null; }}
    onLostPointerCapture={() => { previous.current = null; }}
    onKeyDown={(event) => {
      const keys = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      if (keys.includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        onDelta(event.key === keys[0] ? -24 : 24);
      } else if (event.key === "Home") { event.preventDefault(); event.stopPropagation(); onReset(); }
    }}
  />;
}

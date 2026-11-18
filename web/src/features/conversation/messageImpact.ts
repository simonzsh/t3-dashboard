import { useLayoutEffect, useRef } from "react";
import { enter, reducedMotion } from "../../ui/index.ts";

const SPARK_COUNT = 14;
const EASE_OUT = "cubic-bezier(.18, .64, .24, 1)";

export function impactSparks(width: number, height: number) {
  return Array.from({ length: SPARK_COUNT }, (_, index) => {
    const direction = (index + 0.29) * 2 * Math.PI / SPARK_COUNT;
    const x = Math.cos(direction);
    const y = Math.sin(direction);
    const edge = Math.max(Math.abs(x), Math.abs(y));
    const distance = 28 + (index % 4) * 4;
    const dot = index % 3 === 0;
    return {
      left: width / 2 * (1 + x / edge) + x * 3,
      top: height / 2 * (1 + y / edge) + y * 3,
      dx: x * distance,
      dy: y * distance,
      angle: direction,
      size: dot ? 3 + index % 2 : 8 + index % 4 * 2,
      thickness: dot ? 3 + index % 2 : 2,
      duration: 300 + (index % 4) * 36,
    };
  });
}

function playMessageImpact(bubble: HTMLElement): void {
  if (reducedMotion()) return;
  const layer = bubble.closest(".messages-frame")?.querySelector<HTMLElement>(":scope > .message-impacts");
  if (!layer) return;
  const area = layer.getBoundingClientRect();
  const { left, top, width, height } = bubble.getBoundingClientRect();
  const impact = document.createElement("div");
  impact.className = "message-impact";
  Object.assign(impact.style, { left: `${left - area.left}px`, top: `${top - area.top}px`, width: `${width}px`, height: `${height}px` });
  layer.append(impact);

  // The optimistic bubble can be replaced before the burst finishes.
  function animate(className: string, frames: Keyframe[], duration: number, style?: Partial<CSSStyleDeclaration>) {
    const piece = document.createElement("span");
    piece.className = className;
    if (style) Object.assign(piece.style, style);
    impact.append(piece);
    return piece.animate(frames, { duration, easing: EASE_OUT }).finished;
  }

  const flash = animate("message-impact-flash", [{ opacity: 0.42 }, { opacity: 0 }], 210);
  const wave = animate("message-impact-wave", [
    { inset: "0px", opacity: 0.76, borderWidth: "2px" },
    { inset: "-13px", opacity: 0, borderWidth: "1px" },
  ], 345);
  const sparks = impactSparks(width, height).map(({ left, top, dx, dy, angle, size, thickness, duration }) =>
    animate("message-impact-spark", [
      { translate: "-50% -50%", scale: "0.65", opacity: 0.95 },
      { opacity: 0.9, offset: 0.25 },
      { translate: `calc(-50% + ${dx}px) calc(-50% + ${dy}px)`, scale: "0.35", opacity: 0 },
    ], duration, { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${thickness}px`, rotate: `${angle}rad` }),
  );
  void Promise.allSettled([flash, wave, ...sparks]).then(() => impact.remove());
}

export function useMessageArrival(playOnMount: boolean) {
  const bubble = useRef<HTMLDivElement>(null);
  const arrival = useRef(playOnMount);
  useLayoutEffect(() => {
    if (!arrival.current) return;
    const element = bubble.current;
    let active = true;
    let animation: Animation | null = null;
    // Let the message list scroll to the new bubble before measuring its impact.
    queueMicrotask(() => {
      if (!active || !element?.isConnected) return;
      playMessageImpact(element);
      animation = enter(element, { y: 8, scale: 0.94, spring: true });
    });
    return () => {
      active = false;
      animation?.cancel();
    };
  }, []);
  return bubble;
}

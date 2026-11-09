import { useEffect, useRef } from "react";
import { reducedMotion } from "../../ui/index.ts";

/** CSS depth keeps the small mascot light enough for several live sessions. */
export function WorkingRobot({ thinking = false, waiting = false }: { thinking?: boolean; waiting?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = root.current;
    if (thinking || waiting || !scene) return;
    const animations = new Set<Animation>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let stopped = false;
    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!stopped) callback();
      }, delay);
      timers.add(timer);
    };
    const play = (element: Element, frames: Keyframe[], duration: number, done?: () => void) => {
      const animation = element.animate(frames, { duration, easing: "linear" });
      animations.add(animation);
      animation.onfinish = () => {
        animations.delete(animation);
        if (!stopped) done?.();
      };
    };
    const keys = scene.querySelectorAll(".robot-keyboard i");
    // Each hand finishes its stroke before the next one starts. No timer can cut it short.
    const startHand = (right: boolean) => {
      const hand = scene.querySelector(right ? ".robot-hand.right" : ".robot-hand.left")!;
      const arm = scene.querySelector(right ? ".robot-arm.right" : ".robot-arm.left")!;
      const stroke = () => {
        if (stopped) return;
        if (reducedMotion() || document.hidden) {
          later(stroke, 250);
          return;
        }
        const column = (right ? 3 : 0) + Math.floor(Math.random() * 2);
        const row = Math.floor(Math.random() * 3);
        const x = (column - (right ? 4 : 0)) * 6;
        const lift = 3 + Math.random() * 3;
        const duration = 280 + Math.random() * 60;
        const easing = "cubic-bezier(0.45, 0, 0.55, 1)";
        play(hand, [
          { transform: "translate(0, 0) rotate(0deg)", easing },
          { transform: `translate(${x}px, -${lift}px) rotate(${right ? -9 : 9}deg)`, offset: 0.35, easing },
          { transform: `translate(${x}px, ${1 + row * 0.5}px) rotate(0deg)`, offset: 0.65, easing },
          { transform: "translate(0, 0) rotate(0deg)" },
        ], duration, stroke);
        // Transform preserves the resting CSS rotation, so the shoulder does not snap.
        play(arm, [
          { transform: "rotate(0deg)", easing },
          { transform: `rotate(${right ? -7 : 7}deg)`, offset: 0.35, easing },
          { transform: "rotate(0deg)" },
        ], duration);
        later(() => {
          if (reducedMotion() || document.hidden) return;
          play(keys[row * 5 + column]!, [
            { transform: "translateY(0)", easing },
            { transform: "translateY(1px)", background: "var(--work)", offset: 0.3, easing },
            { transform: "translateY(0)" },
          ], 180);
        }, duration * 0.5);
      };
      stroke();
    };
    startHand(false);
    later(() => startHand(true), 150);
    return () => {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      for (const animation of animations) animation.cancel();
    };
  }, [thinking, waiting]);
  return (
    <div ref={root} className={`working-robot ${waiting ? "waiting" : thinking ? "thinking" : "typing"}`} aria-hidden="true">
      <div className="robot-size">
        <div className="robot-scene">
          <div className="robot-head"><i className="robot-antenna" /><div className="robot-face"><i /><i /></div></div>
          <div className="robot-body" />
          <div className="robot-arm left" /><div className="robot-arm right" />
          <div className="robot-hand left" /><div className="robot-hand right" />
          <div className="robot-keyboard">{Array.from({ length: 15 }, (_, i) => <i key={i} />)}</div>
          <div className="robot-thought"><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
}

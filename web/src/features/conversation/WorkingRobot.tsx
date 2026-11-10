import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, pauseAnimations, reducedMotion } from "../../ui/index.ts";

/** CSS depth keeps the small mascot light enough for several live sessions. */
export function WorkingRobot({ thinking = false, waiting = false, sleeping = false, background = false }: { thinking?: boolean; waiting?: boolean; sleeping?: boolean; background?: boolean }) {
  const pose = waiting ? "waiting" : background ? "background" : sleeping ? "sleeping" : thinking ? "thinking" : "typing";
  const previousPose = useRef(pose);
  const interrupted = useRef<Keyframe[] | null>(null);
  const root = useRef<HTMLButtonElement>(null);
  const [reacting, setReacting] = useState(false);
  const greeting = useRef(false);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || previousPose.current === pose) return;
    const parts = [...node.querySelectorAll<HTMLElement>(".robot-head, .robot-arm, .robot-hand, .robot-wave-arm, .robot-clock, .robot-snooze, .robot-thought, .robot-face > i")];
    const sample = (part: HTMLElement) => {
      const style = getComputedStyle(part);
      return Object.fromEntries(["transform", "rotate", "top", "right", "height", "width", "opacity", "borderRadius"].map(key => [key, style[key as keyof CSSStyleDeclaration]])) as Keyframe;
    };
    // Read the visible pose before changing its class, including interrupted motion.
    const before = interrupted.current ?? parts.map(sample);
    interrupted.current = null;
    node.classList.remove(previousPose.current);
    node.classList.add(pose);
    previousPose.current = pose;
    if (reducedMotion()) return;
    const resumes = parts.map(part => pauseAnimations(part));
    const transitions = parts.map((part, index) => part.animate([before[index]!, sample(part)], {
      duration: 320, easing: "cubic-bezier(0.45, 0, 0.55, 1)",
    }));
    void Promise.all(transitions.map(animation => animation.finished.catch(() => {}))).then(() => resumes.forEach(resume => resume()));
    return () => {
      interrupted.current = parts.map(sample);
      for (const animation of transitions) animation.cancel();
      resumes.forEach(resume => resume());
    };
  }, [pose]);
  useEffect(() => {
    if (!reacting || !root.current) return;
    const head = root.current.querySelector<HTMLElement>(".robot-head")!;
    const resume = pauseAnimations(head);
    const rest = getComputedStyle(head).transform;
    const ease = "cubic-bezier(0.45, 0, 0.55, 1)";
    // Return to the captured pose before resuming its idle animation.
    const animation = reducedMotion() ? null : head.animate([
      { transform: rest, easing: ease },
      { transform: "translateZ(18px) rotate(-9deg) translateY(-2px)", offset: 0.3, easing: ease },
      { transform: "translateZ(18px) rotate(-9deg) translateY(-2px)", offset: 0.65, easing: ease },
      { transform: rest },
    ], { duration: 1600 });
    const timer = setTimeout(() => { greeting.current = false; setReacting(false); }, 1600);
    return () => {
      clearTimeout(timer);
      animation?.cancel();
      resume();
    };
  }, [reacting, pose]);
  useLayoutEffect(() => {
    const scene = root.current;
    if (pose !== "typing" || !scene) return;
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
    later(() => startHand(false), 320);
    later(() => startHand(true), 470);
    return () => {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      for (const animation of animations) animation.cancel();
    };
  }, [pose]);
  return (
    <Pressable ref={root} className={`working-robot ${previousPose.current}${reacting ? " reacting" : ""}`}
      aria-label={pose === "sleeping" ? "Wake the robot" : "Greet the robot"}
      onClick={(event) => { event.stopPropagation(); if (!greeting.current) { greeting.current = true; setReacting(true); } }}>
      <div className="robot-size" aria-hidden="true">
        <div className="robot-scene">
          <div className="robot-head"><i className="robot-antenna" /><div className="robot-face"><i /><i /><span className="robot-love-eyes">
            {[0, 1].map(eye => <svg key={eye} viewBox="0 0 24 24"><path d="M12 21 3 12C-3 5 6-2 12 5 18-2 27 5 21 12Z" /></svg>)}
          </span></div></div>
          <div className="robot-body" />
          <div className="robot-arm left" /><div className="robot-arm right" />
          <div className="robot-hand left" /><div className="robot-hand right" />
          <div className="robot-wave-arm"><i className="robot-forearm" /><i className="robot-palm" /></div>
          <div className="robot-keyboard">{Array.from({ length: 15 }, (_, i) => <i key={i} />)}</div>
          <div className="robot-snooze"><span>z</span><span>z</span><span>Z</span></div>
          <div className="robot-clock"><span className="robot-clock-hour" /><span className="robot-clock-minute" /></div>
          <div className="robot-thought"><i /><i /><i /></div>
        </div>
      </div>
    </Pressable>
  );
}

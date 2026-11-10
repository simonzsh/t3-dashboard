import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, pauseAnimations, reducedMotion } from "../../ui/index.ts";
import { RobotVisibilityContext } from "../../lib/robotPreference.ts";

interface Props { thinking?: boolean; waiting?: boolean; sleeping?: boolean; background?: boolean }

export function WorkingRobot(props: Props) {
  return useContext(RobotVisibilityContext) ? <AnimatedRobot {...props} /> : null;
}

/** CSS depth keeps the small mascot light enough for several live sessions. */
function AnimatedRobot({ thinking = false, waiting = false, sleeping = false, background = false }: Props) {
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
    let drinking = false;
    let nextSip = performance.now() + 12000 + Math.random() * 18000;
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
    const face = scene.querySelector(".robot-face")!;
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
        if (drinking || greeting.current) {
          later(stroke, 250);
          return;
        }
        if (right && performance.now() >= nextSip) {
          drinking = true;
          const cup = scene.querySelector(".robot-cup")!;
          const duration = 4200 + Math.random() * 800;
          later(() => face.classList.add("sipping"), duration * 0.42);
          later(() => face.classList.remove("sipping"), duration * 0.76);
          const easing = "cubic-bezier(0.45, 0, 0.55, 1)";
          // Reveal the cup only while the hand holds it.
          play(cup, [
            { opacity: 0, transform: "translateZ(32px) translate(0, 0) rotate(0deg)", offset: 0, easing },
            { opacity: 0, transform: "translateZ(32px) translate(0, 0) rotate(0deg)", offset: 0.18, easing },
            { opacity: 1, transform: "translateZ(32px) translate(0, 0) rotate(0deg)", offset: 0.2, easing },
            { opacity: 1, transform: "translateZ(32px) translate(-28px, -30px) rotate(0deg)", offset: 0.42, easing },
            { opacity: 1, transform: "translateZ(32px) translate(-31px, -33px) rotate(-18deg)", offset: 0.52, easing },
            { opacity: 1, transform: "translateZ(32px) translate(-31px, -33px) rotate(-18deg)", offset: 0.65, easing },
            { opacity: 1, transform: "translateZ(32px) translate(-28px, -30px) rotate(0deg)", offset: 0.73, easing },
            { opacity: 1, transform: "translateZ(32px) translate(0, 0) rotate(0deg)", offset: 0.9, easing },
            { opacity: 0, transform: "translateZ(32px) translate(0, 0) rotate(0deg)", offset: 0.92, easing },
            { opacity: 0, transform: "translateZ(32px) translate(0, 0) rotate(0deg)" },
          ], duration);
          play(arm, [
            { transform: "translateZ(0px) rotate(0deg)", easing },
            { transform: "translateZ(28px) rotate(-37deg) scaleY(1.8)", offset: 0.2, easing },
            { transform: "translateZ(28px) rotate(-88deg) scaleY(0.5)", offset: 0.42, easing },
            { transform: "translateZ(28px) rotate(-136deg) scaleY(0.5)", offset: 0.52, easing },
            { transform: "translateZ(28px) rotate(-136deg) scaleY(0.5)", offset: 0.65, easing },
            { transform: "translateZ(28px) rotate(-88deg) scaleY(0.5)", offset: 0.73, easing },
            { transform: "translateZ(28px) rotate(-37deg) scaleY(1.8)", offset: 0.9, easing },
            { transform: "translateZ(0px) rotate(0deg)" },
          ], duration);
          play(hand, [
            { transform: "translateZ(0px) translate(0, 0)", easing },
            { transform: "translateZ(28px) translate(23px, 11px)", offset: 0.2, easing },
            { transform: "translateZ(28px) translate(-5px, -19px)", offset: 0.42, easing },
            { transform: "translateZ(28px) translate(-8px, -22px) rotate(-18deg)", offset: 0.52, easing },
            { transform: "translateZ(28px) translate(-8px, -22px) rotate(-18deg)", offset: 0.65, easing },
            { transform: "translateZ(28px) translate(-5px, -19px)", offset: 0.73, easing },
            { transform: "translateZ(28px) translate(23px, 11px)", offset: 0.9, easing },
            { transform: "translateZ(0px) translate(0, 0)" },
          ], duration, () => {
            drinking = false;
            nextSip = performance.now() + 20000 + Math.random() * 35000;
            stroke();
          });
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
      face.classList.remove("sipping");
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
          <div className="robot-cup" />
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

import { useEffect, useState } from "react";
import type { TurnStep } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { STEP_LABELS, duration, failure } from "../../lib/format.ts";
import { useAction } from "../../lib/useAction.ts";
import { Button, Icon, IconButton, Loader, Pressable } from "../../ui/index.ts";
import { MarkdownText } from "./MarkdownText.tsx";
import { StepRow, useStepDetail } from "./Steps.tsx";
import { STEP_ICONS } from "./steps.ts";

const CHILD_REFRESH_MS = 5000;
const TODO_LABELS = { pending: "To do", running: "In progress", completed: "Done" } as const;

export function TodoCard({ step }: { step: TurnStep }) {
  const todos = step.todos ?? [];
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <section className="todo-card">
      <header>
        <Icon name={STEP_ICONS.todo} />
        <span className="todo-title">{step.text}</span>
        <span className="todo-count">
          {done}/{todos.length}
        </span>
      </header>
      <ul>
        {todos.map((todo, i) => (
          <li key={i} className={`todo ${todo.status}`}>
            <span className="todo-mark" role="img" aria-label={TODO_LABELS[todo.status]}>
              {todo.status === "completed" && <Icon name="check" strokeWidth={3} />}
            </span>
            <span className="todo-text">{todo.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PlanCard({ step, threadId }: { step: TurnStep; threadId: string }) {
  return (
    <section className="plan-card">
      <header>
        <Icon name={STEP_ICONS.plan} />
        {step.text}
      </header>
      <div className="md">
        <MarkdownText text={step.markdown ?? ""} threadId={threadId} />
      </div>
    </section>
  );
}

export function NoticeRow({ step }: { step: TurnStep }) {
  return (
    <div className={`notice-row ${step.notice ?? "system"}`}>
      <Icon name={step.notice === "error" ? "alert" : STEP_ICONS.notice} />
      <span>{step.text}</span>
      {step.detail && <span className="notice-detail">{step.detail}</span>}
    </div>
  );
}

interface SubagentProps {
  step: TurnStep;
  threadId: string;
  onOpenThread?: (id: string) => void;
  /** The stop changes the state in T3: the panel reloads. */
  onChanged: () => void;
}

export function SubagentBlock({ step, threadId, onOpenThread, onChanged }: SubagentProps) {
  const api = useApi();
  const sub = step.subagent;
  const running = step.status === "running";
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const action = useAction("stop the subagent");

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!sub) return null;
  const end = step.completedAt ? Date.parse(step.completedAt) : now;
  const elapsed = step.startedAt ? duration(end - Date.parse(step.startedAt)) : null;
  const line = running ? (sub.progress ?? step.detail) : step.detail;
  return (
    <section className={`subagent-block ${step.status}`}>
      <div className="subagent-block-head">
        <Pressable className="subagent-block-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />
          <Icon name={STEP_ICONS.subagent} />
          <span className="subagent-block-text">
            <span className="subagent-block-title">{step.text}</span>
            {line && <span className="subagent-block-line">{line}</span>}
          </span>
        </Pressable>
        <span className="subagent-block-side">
          <span className={`subagent-block-status ${step.status}`}>{STEP_LABELS[step.status]}</span>
          {elapsed && <span className="subagent-block-time">{elapsed}</span>}
          {sub.stoppable && (
            <IconButton
              label="Stop subagent"
              tooltip="Stop subagent"
              size="sm"
              variant="ghost"
              className="subagent-block-stop"
              disabled={stopping}
              aria-busy={stopping || undefined}
              onClick={() => void action.run(() => api.stopSubagent(threadId, sub.subagentId).finally(onChanged), setStopping)}
            >
              <Icon name="stop" />
            </IconButton>
          )}
        </span>
      </div>
      {open && <SubagentBody step={step} threadId={threadId} onOpenThread={onOpenThread} />}
    </section>
  );
}

function SubagentBody({ step, threadId, onOpenThread }: Pick<SubagentProps, "step" | "threadId" | "onOpenThread">) {
  const api = useApi();
  const childId = step.subagent?.childThreadId ?? null;
  const progress = step.subagent?.progress ?? null;
  const [child, setChild] = useState<TurnStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = step.status !== "running";
  const { detail } = useStepDetail(threadId, step, finished);

  // Reload when the progress or status changes, and every few seconds while it runs.
  useEffect(() => {
    if (!childId) return;
    let alive = true;
    const load = () =>
      api.getThread(childId).then(
        (d) => {
          if (!alive) return;
          setChild(d.steps);
          setError(null);
        },
        (e) => alive && setError(failure("load the subagent steps", e)),
      );
    void load();
    if (finished) return () => void (alive = false);
    const id = setInterval(() => void load(), CHILD_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [childId, progress, step.status]);

  return (
    <div className="subagent-block-body">
      {detail?.text && (
        <div className="md">
          <MarkdownText text={detail.text} threadId={threadId} />
        </div>
      )}
      {childId && (
        <>
          {error && <p className="step-error">{error}</p>}
          {!child && !error && <Loader />}
          {child && child.length === 0 && <p className="step-empty">No steps yet</p>}
          {child && child.length > 0 && (
            <ul className="step-list">
              {child.map((s) => (
                <li key={s.id}>
                  <StepRow step={s} threadId={childId} />
                </li>
              ))}
            </ul>
          )}
          {onOpenThread && (
            <Button size="sm" variant="ghost" onClick={() => onOpenThread(childId)}>
              Open thread
            </Button>
          )}
        </>
      )}
    </div>
  );
}

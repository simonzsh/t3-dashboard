import type { TurnStep } from "../../../../shared/api.ts";
import { Icon } from "../../ui/index.ts";
import { MarkdownText } from "./MarkdownText.tsx";
import { STEP_ICONS } from "./steps.ts";

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

import { memo, useEffect, useState } from "react";
import type { StepDetail, TurnStep } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { duration, failure } from "../../lib/format.ts";
import { safeHref } from "../../lib/markdown.tsx";
import { Chevron, Icon, Loader, Pressable } from "../../ui/index.ts";
import { STEP_ICONS, diffLines, groupLabel, remember } from "./steps.ts";

const LIVE_VISIBLE = 4;
const DETAIL_REFRESH_MS = 3000;
// A finished step never changes: expanding it again costs nothing. Capped, oldest out first.
const DETAIL_CACHE_MAX = 200;
const detailCache = new Map<string, StepDetail>();

export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** One group of agent steps. Collapsed, except the live one, which shows its latest steps. */
export function WorkGroup({ steps, threadId, live }: { steps: TurnStep[]; threadId: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const now = useTicker(live);
  const start = steps[0]?.startedAt;
  const label = live ? (start ? `Working for ${duration(now - Date.parse(start))}` : "Working") : groupLabel(steps);
  const shown = open ? steps : live ? steps.slice(-LIVE_VISIBLE) : [];
  return (
    <div className={`work-group${live ? " live" : ""}`}>
      <Pressable className="work-group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        {label}
      </Pressable>
      {shown.length > 0 && (
        <ul className="step-list">
          {shown.map((step) => (
            <li key={step.id}>
              <StepRow step={step} threadId={threadId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepHead({ step }: { step: TurnStep }) {
  return (
    <>
      <Icon name={STEP_ICONS[step.kind]} />
      <span className="step-text">{step.text}</span>
      {step.detail && <span className="step-detail">{step.detail}</span>}
      {step.exitCode !== null && step.exitCode !== 0 && <span className="step-exit">exit {step.exitCode}</span>}
    </>
  );
}

/** A row that opens to the full command, output, diff or results when T3 has them. */
export const StepRow = memo(function StepRow({ step, threadId }: { step: TurnStep; threadId: string }) {
  const [open, setOpen] = useState(false);
  const cls = `step ${step.kind} ${step.status}`;
  if (!step.expandable) {
    return (
      <div className={cls}>
        <div className="step-head">
          <StepHead step={step} />
        </div>
      </div>
    );
  }
  return (
    <div className={cls}>
      <Pressable className="step-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <StepHead step={step} />
        <Chevron open={open} />
      </Pressable>
      {open && <StepBody step={step} threadId={threadId} />}
    </div>
  );
});

/** Loads the detail of a step; a running step reloads while it is open. */
export function useStepDetail(threadId: string, step: TurnStep, enabled = true): { detail: StepDetail | null; error: string | null } {
  const api = useApi();
  const key = `${threadId}\u0000${step.id}`;
  const running = step.status === "running";
  const [state, setState] = useState<{ key: string; detail: StepDetail | null; error: string | null }>(() => ({ key, detail: detailCache.get(key) ?? null, error: null }));
  useEffect(() => {
    if (!enabled) return;
    const cached = detailCache.get(key);
    if (cached && !running) {
      setState({ key, detail: cached, error: null });
      return;
    }
    let alive = true;
    const load = () =>
      api.getStepDetail(threadId, step.id).then(
        (detail) => {
          if (!running) remember(detailCache, key, detail, DETAIL_CACHE_MAX);
          if (alive) setState({ key, detail, error: null });
        },
        (e) => {
          if (alive) setState((s) => ({ key, detail: s.key === key ? s.detail : null, error: failure("load the step", e) }));
        },
      );
    void load();
    if (!running) return () => void (alive = false);
    const id = setInterval(() => void load(), DETAIL_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [key, running, enabled]);
  return state.key === key ? { detail: state.detail, error: state.error } : { detail: null, error: null };
}

function StepBody({ step, threadId }: { step: TurnStep; threadId: string }) {
  const { detail, error } = useStepDetail(threadId, step);
  if (error) return <p className="step-error">{error}</p>;
  if (!detail) return <Loader />;
  const { input, output, diff, text, results } = detail;
  const showInput = input !== null && step.kind !== "command";
  const empty = !showInput && !output && !diff && !text && results.length === 0;
  return (
    <div className="step-body">
      {step.kind === "command" && input && <pre className="step-code step-input">{`$ ${input}`}</pre>}
      {showInput && <pre className="step-code">{input}</pre>}
      {output && <pre className="step-code step-output">{output}</pre>}
      {diff && <DiffView diff={diff} />}
      {text && <p className="step-text-full">{text}</p>}
      {results.length > 0 && (
        <ul className="step-results">
          {results.map((r, i) => (
            <li key={i}>
              {r.url && safeHref(r.url) ? (
                <a className="step-result-title" href={safeHref(r.url)!} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
              ) : (
                <span className="step-result-title">{r.title}</span>
              )}
              {r.snippet && <span className="step-result-snippet">{r.snippet}</span>}
            </li>
          ))}
        </ul>
      )}
      {empty && <p className="step-empty">No output</p>}
      {detail.exitCode !== null && step.kind === "command" && <p className={`step-exit-line${detail.exitCode === 0 ? "" : " failed"}`}>Exit code {detail.exitCode}</p>}
      {detail.truncated && <p className="step-cut">Cut: only part of this is shown.</p>}
    </div>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="diff">
      {diffLines(diff).map((line, i) => (
        <span key={i} className={`diff-line ${line.type}`}>
          {line.text}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

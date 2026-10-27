import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import type { AutomationsResult, DashboardState } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { groupAgents } from "../../lib/threads.ts";
import { excludeRoutineThreads, finishedSetups, setupThreads } from "./automations.ts";
import { AgentCard } from "./AgentCard.tsx";
import { AutomationsColumn } from "./AutomationsColumn.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { useScrolled } from "../../lib/useScrolled.ts";
import { swipeDirection } from "../../lib/swipe.ts";
import { enter, Icon, Kbd, Loader, Pressable, TextInput } from "../../ui/index.ts";

interface Props {
  state: DashboardState;
  now: Date;
  deskIds: ReadonlySet<string>;
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  onSwitcher: (initialQuery: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  onAutomationsStale: () => Promise<void>;
}

const NONE: readonly string[] = [];
const PHONE = "(max-width: 700px)";

type Pane = "agents" | "automations";
const PANES: ReadonlyArray<{ id: Pane; label: string }> = [
  { id: "agents", label: "Agents" },
  { id: "automations", label: "Automations" },
];

/** On a phone, one pane at a time: a horizontal swipe or the dots switch it, and the new pane slides in from its side. */
function usePanes(enabled: boolean) {
  const [pane, setPane] = useState<Pane>("agents");
  const layout = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef(pane);
  useLayoutEffect(() => {
    if (shown.current === pane) return;
    shown.current = pane;
    const el = layout.current?.firstElementChild;
    if (el) enter(el, { x: pane === "automations" ? 32 : -32, duration: 200 });
  }, [pane]);
  const show = (next: Pane) => {
    if (next === pane) return;
    // The page scrolls on a phone: the new pane starts at its top, not halfway down.
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
    setPane(next);
  };
  const swipe = enabled
    ? {
        onTouchStart: (e: TouchEvent) => {
          const t = e.touches[0];
          start.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
        },
        onTouchEnd: (e: TouchEvent) => {
          const from = start.current;
          const t = e.changedTouches[0];
          start.current = null;
          if (!from || !t) return;
          const dir = swipeDirection(t.clientX - from.x, t.clientY - from.y);
          if (dir === "left") show("automations");
          if (dir === "right") show("agents");
        },
      }
    : {};
  return { pane: enabled ? pane : null, show, layout, swipe };
}

// Collapsed by default: settled threads need no attention.
function RecentlySettled({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="settled">
      <Pressable className="settled-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />
        Recently settled ({count})
      </Pressable>
      {open && <div className="grid">{children}</div>}
    </div>
  );
}

/** Setup rows, plus the ones that just finished: they stay in the column until a fresh list says where they go. */
function useSetupRows(threads: DashboardState["threads"], setupIds: readonly string[], reload: () => Promise<void>) {
  const active = useMemo(() => setupThreads(threads, setupIds), [threads, setupIds]);
  const wasActive = useRef<ReadonlySet<string>>(new Set());
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const key = active.map((t) => t.id).join(",");
  useEffect(() => {
    const done = finishedSetups(wasActive.current, active);
    wasActive.current = new Set(active.map((t) => t.id));
    if (done.length === 0) return;
    setSettling((s) => new Set([...s, ...done]));
    const clear = () => setSettling((s) => new Set([...s].filter((id) => !done.includes(id))));
    void reload().then(clear, clear);
  }, [key]);
  return useMemo(() => [...active, ...threads.filter((t) => settling.has(t.id) && !active.includes(t))], [active, threads, settling]);
}

export function AgentsView({ state, now, deskIds, onOpen, onToggleDesk, onSettle, onSwitcher, automations, automationsError, onAutomationsStale }: Props) {
  const scrolled = useScrolled();
  const hiddenIds = automations?.hiddenThreadIds;
  const setup = useSetupRows(state.threads, automations?.setupThreadIds ?? NONE, onAutomationsStale);
  const groups = useMemo(
    () => groupAgents(excludeRoutineThreads(state.threads, [...(hiddenIds ?? []), ...setup.map((t) => t.id)]), state.projects, now),
    [state.threads, state.projects, hiddenIds, setup, now],
  );
  // Before the first automations answer, routine threads would flash in the grid.
  const available = state.connection.t3 === "live";
  const loading = available && automations === null && automationsError === null;
  const phone = useMediaQuery(PHONE);
  const { pane, show, layout, swipe } = usePanes(phone && available);
  const agents = loading ? (
    <Loader />
  ) : groups.length === 0 ? (
      <div className="empty-state">
        <strong>No active agents</strong>
        <span>Every thread that is not archived in T3 Code appears here.</span>
      </div>
    ) : (
      <div className="agents-groups">
        {groups.map((g) => (
          <section className="group" key={g.project.id}>
            <h2>
              <ProjectIcon icon={g.project.icon} />
              {g.project.title}
              {g.cards.some((c) => c.status === "waiting") && <span className="group-alert" role="img" aria-label="An agent is waiting for your reply" />} <span className="count">{g.cards.length + g.settled.length}</span>
            </h2>
            {g.cards.length > 0 && (
              <div className="grid">
                {g.cards.map((c) => (
                  <AgentCard key={c.thread.id} card={c} now={now} onDesk={deskIds.has(c.thread.id)} t3EnvironmentId={state.t3EnvironmentId} onOpen={onOpen} onToggleDesk={onToggleDesk} onSettle={onSettle} />
                ))}
              </div>
            )}
            {g.settled.length > 0 && (
              <RecentlySettled count={g.settled.length}>
                {g.settled.map((t) => (
                  <AgentCard key={t.id} card={{ thread: t, status: agentStatus(t) }} now={now} onDesk={deskIds.has(t.id)} t3EnvironmentId={state.t3EnvironmentId} onOpen={onOpen} onToggleDesk={onToggleDesk} onSettle={onSettle} />
                ))}
              </RecentlySettled>
            )}
          </section>
        ))}
      </div>
    );
  return (
    <div className="agents-page">
      <div className={`agents-switcher${scrolled ? " scrolled" : ""}`}>
        <Icon name="search" />
        {/* No onFocus: the dialog gives focus back here on close and would reopen. */}
        <TextInput
          readOnly
          aria-label="Jump to a conversation"
          placeholder="Jump to a conversation…"
          onClick={() => onSwitcher("")}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== "Enter" && e.key.length !== 1)) return;
            e.preventDefault();
            onSwitcher(e.key === "Enter" ? "" : e.key);
          }}
        />
        <Kbd>{navigator.platform.startsWith("Mac") ? "⌘K" : "Ctrl K"}</Kbd>
      </div>
      <div ref={layout} className={`agents-layout${available ? "" : " wide"}`} {...swipe}>
        {pane !== "automations" && agents}
        {available && pane !== "agents" && <AutomationsColumn result={automations} error={automationsError} threads={state.threads} projects={state.projects} setup={setup} now={now} onOpen={onOpen} onDeleted={() => void onAutomationsStale()} onRenamed={() => void onAutomationsStale()} />}
      </div>
      {pane && (
        <nav className="pane-dots" aria-label="Views">
          {PANES.map((p) => (
            <Pressable key={p.id} className={p.id === pane ? "active" : ""} aria-label={p.label} aria-current={p.id === pane ? "page" : undefined} onClick={() => show(p.id)} />
          ))}
        </nav>
      )}
    </div>
  );
}

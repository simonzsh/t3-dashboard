import type { DashboardThread } from "../../../shared/api.ts";
import { cut, relativeTime } from "../format.ts";

interface Props {
  thread: DashboardThread;
  projectTitle: string;
  now: Date;
  selected: boolean;
  onOpen: (id: string) => void;
}

export function ThreadCard({ thread: t, projectTitle, now, selected, onOpen }: Props) {
  return (
    <button className={`card${selected ? " selected" : ""}`} onClick={() => onOpen(t.id)}>
      <span className="card-title">{t.title || "(sans titre)"}</span>
      <span className="card-meta">
        {projectTitle} · {t.provider}
        {t.model ? ` / ${t.model}` : ""} · {relativeTime(t.lastActivityAt, now)}
      </span>
      <span className="badges">
        {t.pending?.category === "approval" && <span className="badge warn">Approbation</span>}
        {t.pending?.category === "user-input" && <span className="badge warn">Question</span>}
        {(t.lastError || t.status === "failed") && <span className="badge err">Erreur</span>}
        {t.pinned && <span className="badge">Épinglé</span>}
      </span>
      {t.preview && <span className="card-preview">{cut(t.preview.text, 140)}</span>}
    </button>
  );
}

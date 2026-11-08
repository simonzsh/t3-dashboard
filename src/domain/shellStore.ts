import type { ConnectionStatus, DashboardProject, DashboardProvider, DashboardState, DashboardThread, Diff, ModelDefaults, ProjectIconSpec } from "../../shared/api.ts";
import { NO_MODEL_DEFAULTS } from "./providers.ts";
import { isHidden, isSubagentThread, toDashboardThread } from "./classify.ts";
import { DiffBatch } from "./diffBatch.ts";
import { PROJECT_COLORS } from "../../shared/projectColors.ts";
import { normalizeFolder } from "./folders.ts";
import { toProjectIcon } from "./projectIcon.ts";
import type { RawBackgroundTask, RawProject, RawSnapshot, RawThread, ShellItem } from "../integrations/t3/schemas.ts";

export interface ShellStoreOptions {
  now: () => Date;
  onState(): void;
  onThreads(diff: Diff<DashboardThread>): void;
  onProjects(diff: Diff<DashboardProject>): void;
}

// The icon as T3 stores it, for the edit form; a legacy monogram (a lucide row with monogramText) reads as a monogram.
function iconSpecOf(raw: RawProject["projectIcon"]): ProjectIconSpec | undefined {
  if (!raw) return undefined;
  const color = raw.color && raw.color in PROJECT_COLORS ? raw.color : undefined;
  const text = raw.kind === "monogram" ? raw.text : raw.kind === "lucide" ? (raw.monogramText ?? raw.monogram) : undefined;
  if (text) return color ? { kind: "monogram", text, color } : undefined;
  if (raw.kind === "emoji") return raw.emoji ? { kind: "emoji", emoji: raw.emoji } : undefined;
  return raw.kind === "lucide" && raw.name && color ? { kind: "lucide", name: raw.name, color } : undefined;
}

const toProject = (raw: RawProject): DashboardProject => {
  const iconSpec = iconSpecOf(raw.projectIcon);
  return {
    id: raw.id,
    title: raw.title ?? "",
    defaultModelSelection: raw.defaultModelSelection ?? null,
    icon: toProjectIcon(raw.projectIcon),
    ...(raw.archivedAt ? { archived: true } : {}),
    ...(raw.workspaceRoot ? { workspaceRoot: raw.workspaceRoot } : {}),
    ...(iconSpec ? { iconSpec } : {}),
    ...(raw.defaultThreadEnvMode === "local" || raw.defaultThreadEnvMode === "worktree" ? { defaultThreadEnvMode: raw.defaultThreadEnvMode } : {}),
  };
};

interface Maps {
  threads: Map<string, RawThread>;
  projects: Map<string, RawProject>;
  // Hidden subagent threads are not kept, but their window still needs the parent's folder.
  parents: Map<string, string>;
}

const emptyMaps = (): Maps => ({ threads: new Map(), projects: new Map(), parents: new Map() });

/** Mirror of the T3 shell: syncs from snapshots, then follows live items and emits diffs. */
export class ShellStore {
  private readonly options: ShellStoreOptions;
  private live = emptyMaps();
  private staging: Maps | null = null;
  private derived = new Map<string, DashboardThread>();
  private readonly threadDiff = new DiffBatch<DashboardThread>();
  private readonly projectDiff = new DiffBatch<DashboardProject>();

  constructor(options: ShellStoreOptions) {
    this.options = options;
  }

  beginSync(): void {
    this.staging = emptyMaps();
  }

  isSyncing(): boolean {
    return this.staging !== null;
  }

  apply(items: ShellItem[]): void {
    for (const item of items) {
      if (this.staging && item.kind === "snapshot") {
        this.merge(this.staging, item.snapshot);
        continue;
      }
      if (this.staging) this.commit();
      if (item.kind !== "synchronized") this.applyLive(item);
    }
    this.flush();
  }

  state(connection: ConnectionStatus, providers: DashboardProvider[], t3EnvironmentId: string | null = null, modelDefaults: ModelDefaults = NO_MODEL_DEFAULTS): DashboardState {
    const threads = [...this.derived.values()].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
    return {
      connection,
      projects: [...this.live.projects.values()].map(toProject),
      providers,
      modelDefaults,
      threads,
      t3EnvironmentId,
    };
  }

  /** Live threads as T3 sent them, for matching scheduled tasks. */
  rawThreads(): RawThread[] {
    return [...this.live.threads.values()];
  }

  backgroundTasks(id: string): RawBackgroundTask[] {
    return this.live.threads.get(id)?.pendingBackgroundTasks ?? [];
  }

  /** The project whose folder is `root` (already normalised), archived or not. */
  projectByRoot(root: string): { id: string; archived: boolean } | undefined {
    for (const raw of this.live.projects.values()) {
      if (raw.workspaceRoot && normalizeFolder(raw.workspaceRoot, "") === root) return { id: raw.id, archived: !!raw.archivedAt };
    }
    return undefined;
  }

  /** Where the agent works: the thread's worktree, else its project's root. Null when T3 names none. */
  workspaceOf(threadId: string): string | null {
    const raw = this.live.threads.get(threadId) ?? this.live.threads.get(this.live.parents.get(threadId) ?? "");
    if (!raw) return null;
    return raw.worktreePath || (raw.projectId ? this.live.projects.get(raw.projectId)?.workspaceRoot : null) || null;
  }

  thread(id: string): DashboardThread | undefined {
    return this.derived.get(id);
  }

  // The id wins over the title, so a title equal to another project's id stays unambiguous.
  project(idOrTitle: string): DashboardProject | undefined {
    if (idOrTitle === "") return undefined;
    const projects = [...this.live.projects.values()].map(toProject);
    return projects.find((project) => project.id === idOrTitle) ?? projects.find((project) => project.title === idOrTitle);
  }

  reclassify(now: Date): void {
    for (const [id, raw] of this.live.threads) {
      const next = toDashboardThread(raw, now);
      const previous = this.derived.get(id);
      if (next.settled === previous?.settled) continue;
      this.derived.set(id, next);
      this.threadDiff.upsert(next);
    }
    this.flush();
  }

  private merge(maps: Maps, snapshot: RawSnapshot | undefined): void {
    for (const thread of snapshot?.threads ?? []) {
      if (isHidden(thread)) {
        maps.threads.delete(thread.id);
        if (isSubagentThread(thread) && thread.lineage?.parentThreadId) maps.parents.set(thread.id, thread.lineage.parentThreadId);
      } else maps.threads.set(thread.id, thread);
    }
    for (const project of snapshot?.projects ?? []) {
      if (project.deletedAt) maps.projects.delete(project.id);
      else maps.projects.set(project.id, project);
    }
  }

  private commit(): void {
    const staging = this.staging;
    if (!staging) return;
    this.staging = null;
    this.live = staging;
    const now = this.options.now();
    this.derived = new Map([...staging.threads].map(([id, raw]) => [id, toDashboardThread(raw, now)]));
    this.threadDiff.clear();
    this.projectDiff.clear();
    this.options.onState();
  }

  private applyLive(item: ShellItem): void {
    switch (item.kind) {
      case "snapshot":
        for (const thread of item.snapshot?.threads ?? []) this.upsertThread(thread);
        for (const project of item.snapshot?.projects ?? []) this.upsertProject(project);
        break;
      case "thread.updated":
        this.upsertThread(item.thread, item.location);
        break;
      case "thread.removed":
        this.removeThread(item.threadId);
        break;
      case "project.updated":
        this.upsertProject(item.project);
        break;
      case "project.removed":
        this.removeProject(item.projectId);
        break;
    }
  }

  private upsertThread(raw: RawThread, location?: string): void {
    if (isHidden(raw, location)) {
      this.removeThread(raw.id);
      if (isSubagentThread(raw) && raw.lineage?.parentThreadId) this.live.parents.set(raw.id, raw.lineage.parentThreadId);
      return;
    }
    this.live.threads.set(raw.id, raw);
    const thread = toDashboardThread(raw, this.options.now());
    this.derived.set(raw.id, thread);
    this.threadDiff.upsert(thread);
  }

  private removeThread(id: string): void {
    this.live.parents.delete(id);
    if (!this.live.threads.delete(id)) return;
    this.derived.delete(id);
    this.threadDiff.remove(id);
  }

  private upsertProject(raw: RawProject): void {
    if (raw.deletedAt) return this.removeProject(raw.id);
    this.live.projects.set(raw.id, raw);
    this.projectDiff.upsert(toProject(raw));
  }

  private removeProject(id: string): void {
    if (!this.live.projects.delete(id)) return;
    this.projectDiff.remove(id);
  }

  private flush(): void {
    const threads = this.threadDiff.take();
    if (threads) this.options.onThreads(threads);
    const projects = this.projectDiff.take();
    if (projects) this.options.onProjects(projects);
  }
}

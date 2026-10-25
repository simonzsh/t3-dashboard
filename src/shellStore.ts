import type { ConnectionStatus, DashboardProject, DashboardProvider, DashboardState, DashboardThread, Diff } from "../shared/api.ts";
import { isHidden, toDashboardThread } from "./classify.ts";
import type { RawBackgroundTask, RawProject, RawSnapshot, RawThread, ShellItem } from "./t3/types.ts";

export interface ShellStoreOptions {
  now: () => Date;
  onState(): void;
  onThreads(diff: Diff<DashboardThread>): void;
  onProjects(diff: Diff<DashboardProject>): void;
}

const toProject = (raw: RawProject): DashboardProject => ({ id: raw.id, title: raw.title ?? "", defaultModelSelection: raw.defaultModelSelection ?? null });

interface Maps {
  threads: Map<string, RawThread>;
  projects: Map<string, RawProject>;
}

const emptyMaps = (): Maps => ({ threads: new Map(), projects: new Map() });

/** Mirror of the T3 shell: syncs from snapshots, then follows live items and emits diffs. */
export class ShellStore {
  private readonly options: ShellStoreOptions;
  private live = emptyMaps();
  private staging: Maps | null = null;
  private derived = new Map<string, DashboardThread>();
  private upserted = new Set<string>();
  private removed = new Set<string>();
  private projectUpserted = new Map<string, DashboardProject>();
  private projectRemoved = new Set<string>();

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

  state(connection: ConnectionStatus, providers: DashboardProvider[], automationsAvailable: boolean, t3EnvironmentId: string | null = null): DashboardState {
    const threads = [...this.derived.values()].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
    return {
      connection,
      projects: [...this.live.projects.values()].map(toProject),
      providers,
      threads,
      generatedAt: this.options.now().toISOString(),
      automationsAvailable,
      t3EnvironmentId,
    };
  }

  backgroundTasks(id: string): RawBackgroundTask[] {
    return this.live.threads.get(id)?.pendingBackgroundTasks ?? [];
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
      this.upserted.add(id);
    }
    this.flush();
  }

  private merge(maps: Maps, snapshot: RawSnapshot | undefined): void {
    for (const thread of snapshot?.threads ?? []) {
      if (isHidden(thread)) maps.threads.delete(thread.id);
      else maps.threads.set(thread.id, thread);
    }
    for (const project of snapshot?.projects ?? []) maps.projects.set(project.id, project);
  }

  private commit(): void {
    const staging = this.staging;
    if (!staging) return;
    this.staging = null;
    this.live = staging;
    const now = this.options.now();
    this.derived = new Map([...staging.threads].map(([id, raw]) => [id, toDashboardThread(raw, now)]));
    this.upserted.clear();
    this.removed.clear();
    this.projectUpserted.clear();
    this.projectRemoved.clear();
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
    if (isHidden(raw, location)) return this.removeThread(raw.id);
    this.live.threads.set(raw.id, raw);
    this.derived.set(raw.id, toDashboardThread(raw, this.options.now()));
    this.upserted.add(raw.id);
    this.removed.delete(raw.id);
  }

  private removeThread(id: string): void {
    if (!this.live.threads.delete(id)) return;
    this.derived.delete(id);
    this.upserted.delete(id);
    this.removed.add(id);
  }

  private upsertProject(raw: RawProject): void {
    this.live.projects.set(raw.id, raw);
    this.projectUpserted.set(raw.id, toProject(raw));
    this.projectRemoved.delete(raw.id);
  }

  private removeProject(id: string): void {
    if (!this.live.projects.delete(id)) return;
    this.projectUpserted.delete(id);
    this.projectRemoved.add(id);
  }

  private flush(): void {
    if (this.upserted.size > 0 || this.removed.size > 0) {
      const diff = { upserted: [...this.upserted].map((id) => this.derived.get(id)!), removed: [...this.removed] };
      this.upserted.clear();
      this.removed.clear();
      this.options.onThreads(diff);
    }
    if (this.projectUpserted.size > 0 || this.projectRemoved.size > 0) {
      const diff = { upserted: [...this.projectUpserted.values()], removed: [...this.projectRemoved] };
      this.projectUpserted.clear();
      this.projectRemoved.clear();
      this.options.onProjects(diff);
    }
  }
}

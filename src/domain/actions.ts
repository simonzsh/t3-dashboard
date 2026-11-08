import { homedir } from "node:os";
import { posix } from "node:path";
import { marked } from "marked";
import type { AssignIssueBody, ComposerCommands, CreateProjectBody, CreateThreadBody, FileSearchResult, FolderBrowseResult, LinearIssue, ModelSelection, ProjectIconChoices, ProjectRefs, ProjectVcsStatus, RespondBody, SecretAnswerBody, SendMessageBody, StepDetail, ThreadDetail, ThreadSearchResult, ThreadSettingsBody, UpdateProjectBody, UploadedAttachment } from "../../shared/api.ts";
import { ACTIVE_STATUSES, RUNNING_RUN_STATUSES } from "../../shared/status.ts";
import { IntegrationError } from "../integrations/errors.ts";
import {
  approvalCommand,
  cancelQueuedCommand,
  dismissCommand,
  editQueuedCommand,
  promoteQueuedCommand,
  startQueuedCommand,
  settleCommand,
  rollbackCommand,
  unsettleCommand,
  interruptCommand,
  launchPayload,
  messageCommand,
  modelSelectionCommand,
  runtimeModeCommand,
  subagentStopCommand,
  threadStopCommand,
  userInputCommand,
  workspaceStrategy,
  type DispatchMode,
  type OutgoingMessage,
  type UnsentCommand,
} from "../integrations/t3/commands.ts";
import type { AssetResource, FileUpload, ImageUpload, RawProjection, T3Port } from "../integrations/t3/schemas.ts";
import { DomainError } from "./errors.ts";
import { expandHome, normalizeFolder } from "./folders.ts";
import { projectIconChoices } from "./projectIcon.ts";
import { toComposerCommands } from "./providers.ts";
import type { LinearBoard } from "./linearBoard.ts";
import type { ShellStore } from "./shellStore.ts";
import { rewindPoints, subagentStatus, toStepDetail, toThreadDetail } from "./threadDetail.ts";

export type { FileUpload, ImageUpload };


export interface ActionsOptions {
  port: T3Port;
  store: Pick<ShellStore, "thread" | "project" | "backgroundTasks" | "workspaceOf" | "projectByRoot">;
  board: Pick<LinearBoard, "get">;
  newId?: () => string;
  /** What "~" means in a typed path; the demo has its own. */
  home?: string;
}

/** What the user can do to T3 threads from the dashboard. */
export interface Actions {
  threadDetail(threadId: string): Promise<ThreadDetail>;
  /** Message matches in threads the dashboard lists, in T3's order. */
  searchThreads(query: string, limit?: number): Promise<ThreadSearchResult>;
  /** The full item behind a step: command output, diff, tool input. */
  stepDetail(threadId: string, itemId: string): Promise<StepDetail>;
  /** Files and folders of the thread's workspace that match the query; empty when T3 names no folder. */
  searchFiles(threadId: string, query: string, limit: number): Promise<FileSearchResult>;
  /** The commands and skills the provider offers in the thread's folder, for the / and $ menus. */
  composerCommands(threadId: string, instanceId: string): Promise<ComposerCommands>;
  /** Stores one file in T3, ready to go with a message. */
  uploadAttachment(upload: FileUpload): Promise<UploadedAttachment>;
  deleteAttachment(attachmentId: string): Promise<void>;
  /** Adds a folder as a T3 project, creating the folder if it is missing; an existing project for it is reused. */
  createProject(body: CreateProjectBody): Promise<{ projectId: string; created: boolean }>;
  /** Changes the given fields of a project; the folder must exist. */
  updateProject(projectId: string, body: UpdateProjectBody): Promise<void>;
  /** Deletes the project and all its threads from T3; the folder stays on disk. */
  deleteProject(projectId: string): Promise<void>;
  projectIcons(): ProjectIconChoices;
  /** Folder suggestions for a typed path, and what is at that path. */
  browseFolders(path: string): Promise<FolderBrowseResult>;
  /** Branches of the project's folder, for the new-thread branch picker; empty when the folder is not a git repository. */
  projectRefs(projectId: string, options: { query?: string; cursor?: number }): Promise<ProjectRefs>;
  projectVcsStatus(projectId: string): Promise<ProjectVcsStatus>;
  createThread(create: CreateThreadBody, images: ImageUpload[], uploads?: UploadedAttachment[]): Promise<string>;
  sendMessage(threadId: string, body: Omit<SendMessageBody, "attachments" | "uploads">, images: ImageUpload[], uploads?: UploadedAttachment[]): Promise<void>;
  changeSettings(threadId: string, settings: ThreadSettingsBody): Promise<void>;
  interrupt(threadId: string): Promise<void>;
  /** Steers the active run with a queued message, or starts it when no run is active. */
  sendQueued(threadId: string, runId: string): Promise<void>;
  editQueued(threadId: string, runId: string, text: string): Promise<void>;
  cancelQueued(threadId: string, runId: string): Promise<void>;
  /** Stops a running subagent the way T3 Code does; a delegated task also loses its own thread. */
  stopSubagent(threadId: string, subagentId: string): Promise<void>;
  respond(threadId: string, requestId: string, answer: RespondBody): Promise<void>;
  dismiss(threadId: string, requestId: string): Promise<void>;
  /** Hands a secret the agent asked for to T3, or declines the request. The value is never kept or logged. */
  answerSecret(threadId: string, itemId: string, answer: SecretAnswerBody): Promise<void>;
  /** Rewinds the thread to before a user message; `restoreFiles` also undoes the agent's file edits. */
  rewind(threadId: string, messageId: string, restoreFiles: boolean): Promise<void>;
  settle(threadId: string): Promise<void>;
  unsettle(threadId: string): Promise<void>;
  assign(body: Omit<AssignIssueBody, "attachments" | "uploads">, images: ImageUpload[], uploads?: UploadedAttachment[]): Promise<string>;
  /** An image or page of the thread, fetched from T3. */
  asset(threadId: string, request: AssetRequest, range?: string): Promise<{ response: Response; html: boolean }>;
}

export type AssetRequest = { attachmentId: string } | { path: string };

const MAX_FOLDERS = 100;
// Same page size as the T3 branch picker.
const REFS_PAGE = 100;
const MEDIA_FILE = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mov)$/i;
const ATTACHMENT_ID = /^[\w-]+$/;

// Same lexer as the web view: only a real `![alt](path)` counts, not any text in parentheses.
function addImageTargets(text: string | undefined, into: Set<string>): void {
  if (!text) return;
  marked.walkTokens(marked.lexer(text, { gfm: true }), (token) => {
    if (token.type === "image") into.add(token.href);
  });
}

// A page loads many images at once: they share one projection fetch.
const CITED_TTL_MS = 10_000;

export function createActions(options: ActionsOptions): Actions {
  const { port, store, board } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const home = options.home ?? homedir();

  // Every T3 failure is a T3 error, even one a fake port throws as a plain Error.
  const t3 = async <T>(work: Promise<T>): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError((error as Error).message, { system: "t3", kind: "unreachable" });
    }
  };
  // store.project also matches a title; an edit or delete must hit an id.
  const knownProject = (id: string) => {
    const project = store.project(id);
    if (project?.id !== id) throw new DomainError("not-found", "Project not found");
    return project;
  };
  const send = async (...commands: UnsentCommand[]) => {
    for (const command of commands) await t3(port.dispatch({ ...command, commandId: newId() }));
  };
  // Images are persisted before the dispatch, under the message id it will carry.
  const outgoing = async (threadId: string, images: ImageUpload[], uploads: UploadedAttachment[] = []): Promise<OutgoingMessage> => {
    const messageId = newId();
    return { messageId, attachments: [...(images.length ? await t3(port.persistAttachments(threadId, messageId, images)) : []), ...uploads] };
  };

  // T3 0.0 has no launchThread: say so, rather than let the call fail with a protocol error.
  const requireLaunchSupport = async () => {
    const version = (await t3(port.getConfig())).environment?.serverVersion?.match(/^(\d+)\.(\d+)\./);
    if (version && Number(version[1]) === 0 && Number(version[2]) < 1) throw new DomainError("conflict", "Starting a session needs T3 Code 0.1 or newer: update T3 Code.");
  };
  // The project's folder, which T3 runs git in.
  const folderOf = (project: { workspaceRoot?: string }): string => {
    if (!project.workspaceRoot) throw new DomainError("conflict", "This project has no folder");
    return project.workspaceRoot;
  };
  // The branch is checked out or created before the launch: a failure there starts no thread.
  async function launch(create: Omit<CreateThreadBody, "attachments" | "uploads">, images: ImageUpload[], uploads: UploadedAttachment[] | undefined, generateTitle: boolean): Promise<string> {
    await requireLaunchSupport();
    const choice = create.workspace;
    const touchesGit = choice !== undefined && !(choice.type === "root" && choice.branch === undefined);
    const project = touchesGit ? store.project(create.projectId) : undefined;
    if (touchesGit && project?.id !== create.projectId) throw new DomainError("conflict", "T3 project not found");
    const root = project && folderOf(project);
    let branch: string | null = null;
    if (root !== undefined && choice?.type === "root" && choice.branch !== undefined) {
      branch = choice.create ? await t3(port.createRef(root, choice.branch)) : await t3(port.switchRef(root, choice.branch));
    }
    const threadId = newId();
    const message = await outgoing(threadId, images, uploads);
    await t3(port.launchThread(launchPayload(threadId, create, message, workspaceStrategy(choice, branch, root), { generateTitle }), newId()));
    return threadId;
  }

  const cited = new Map<string, { at: number; paths: Promise<Set<string>> }>();

  function fetchCited(threadId: string) {
    const paths = t3(port.threadProjection(threadId)).then((projection) => {
      const found = new Set<string>();
      for (const message of projection.messages ?? []) if (message.role === "assistant") addImageTargets(message.text, found);
      return found;
    });
    const entry = { at: Date.now(), paths };
    for (const [id, old] of cited) if (entry.at - old.at >= CITED_TTL_MS) cited.delete(id);
    cited.set(threadId, entry);
    paths.catch(() => {
      if (cited.get(threadId) === entry) cited.delete(threadId);
    });
    return entry;
  }

  async function threadCites(threadId: string, path: string): Promise<boolean> {
    const cachedEntry = cited.get(threadId);
    if (cachedEntry && Date.now() - cachedEntry.at < CITED_TTL_MS) {
      if ((await cachedEntry.paths).has(path)) return true;
      // The thread may have cited the path since: check once with a fresh projection.
      const latest = cited.get(threadId);
      // Concurrent misses share the first refetch.
      if (latest && latest !== cachedEntry) return (await latest.paths).has(path);
      cited.delete(threadId);
    }
    return (await fetchCited(threadId).paths).has(path);
  }

  // The shell can lag behind a run start: the projection then knows the run first.
  async function activeRunId(threadId: string, known?: RawProjection): Promise<string | null> {
    const runId = store.thread(threadId)?.activeRunId;
    if (runId) return runId;
    const { runs = [] } = known ?? (await t3(port.threadProjection(threadId)));
    return runs.findLast((run) => RUNNING_RUN_STATUSES.has(run.status ?? ""))?.id ?? null;
  }

  // T3 refuses queue writes once the run left the queue; fail early with a clear message.
  async function queuedRun(threadId: string, runId: string): Promise<RawProjection> {
    const projection = await t3(port.threadProjection(threadId));
    if (projection.runs?.find((run) => run.id === runId)?.status !== "queued") throw new DomainError("conflict", "This message is no longer queued");
    return projection;
  }

  const canStopThread = async () => (await t3(port.getConfig())).environment?.capabilities?.threadStop === true;

  async function findIssue(issueId: string): Promise<LinearIssue> {
    let result = await board.get(false);
    let issue = result.issues.find((entry) => entry.id === issueId);
    if (!issue) {
      result = await board.get(true);
      issue = result.issues.find((entry) => entry.id === issueId);
    }
    if (issue) return issue;
    if (!result.ok) throw new IntegrationError(result.error ?? "Linear error", { system: "linear", kind: "unreachable" });
    throw new DomainError("not-found", "Unknown issue");
  }

  return {
    async searchThreads(query, limit) {
      const matches = await t3(port.searchThreads(query, limit));
      return { matches: matches.filter((match) => store.thread(match.threadId)) };
    },

    async threadDetail(threadId) {
      return toThreadDetail(threadId, await t3(port.threadProjection(threadId)), store.thread(threadId), store.backgroundTasks(threadId));
    },

    async stepDetail(threadId, itemId) {
      const item = await t3(port.turnItem(threadId, itemId));
      if (!item) throw new DomainError("not-found", "No such step in this thread");
      // Projection subagents hold the result when the item has none.
      const needsProjection = item.type === "subagent" && !item.result?.trim();
      return toStepDetail(item, needsProjection ? await t3(port.threadProjection(threadId)) : undefined);
    },

    async searchFiles(threadId, query, limit) {
      const cwd = store.workspaceOf(threadId);
      if (!cwd) return { entries: [], truncated: false };
      const { entries, truncated } = await t3(port.searchEntries(cwd, query, limit));
      return { entries: entries.map(({ path, kind }) => ({ path, kind: kind === "directory" ? "directory" : "file" })), truncated: truncated ?? false };
    },

    async composerCommands(threadId, instanceId) {
      return toComposerCommands(await t3(port.getConfig()), instanceId, store.workspaceOf(threadId));
    },

    async uploadAttachment({ type, name, mimeType, sizeBytes, bytes }) {
      const id = await t3(port.uploadAttachment({ type, name, mimeType, sizeBytes, bytes }));
      return { type, id, name, mimeType, sizeBytes };
    },

    async deleteAttachment(attachmentId) {
      await t3(port.deleteAttachment(attachmentId));
    },

    // T3 signs any readable file: only serve images and videos the thread itself shows.
    async asset(threadId, request, range) {
      let resource: AssetResource;
      if ("attachmentId" in request) {
        if (!ATTACHMENT_ID.test(request.attachmentId) || !request.attachmentId.startsWith(`${threadId}-`)) throw new DomainError("not-found", "No such attachment in this thread");
        resource = { _tag: "attachment", attachmentId: request.attachmentId };
      } else {
        const { path } = request;
        if (!path.startsWith("/") || !MEDIA_FILE.test(path) || path.includes("/../") || /[\0-\x1f]/.test(path)) throw new DomainError("invalid", "Only images and videos can be shown");
        if (!(await threadCites(threadId, path))) throw new DomainError("not-found", "This thread does not show that image");
        resource = { _tag: "media-file", threadId, path };
      }
      const { response, fileName } = await t3(port.fetchAsset(resource, range));
      return { response, html: resource._tag === "attachment" && fileName.endsWith(".html") };
    },

    async createProject({ path, title }) {
      const root = normalizeFolder(path, home);
      const existing = store.projectByRoot(root);
      if (existing) {
        if (existing.archived) await t3(port.mutateProject({ type: "project.update", projectId: existing.id, archived: false }, newId()));
        return { projectId: existing.id, created: false };
      }
      const projectId = newId();
      const name = title || posix.basename(root) || "project";
      try {
        await t3(port.mutateProject({ type: "project.create", projectId, title: name, workspaceRoot: root, createWorkspaceRootIfMissing: true }, newId()));
      } catch (error) {
        const reason = error instanceof IntegrationError ? error.reason : undefined;
        if (reason === "WorkspaceRootNotDirectoryError") throw new DomainError("invalid", "This path is a file, not a folder");
        if (reason === "ProjectConflictError" || reason === "ProjectAlreadyExistsError") throw new DomainError("conflict", "Another T3 project already uses this folder");
        throw error;
      }
      return { projectId, created: true };
    },

    async updateProject(projectId, { title, path, icon }) {
      const current = knownProject(projectId);
      const root = path === undefined ? undefined : normalizeFolder(path, home);
      const other = root === undefined ? undefined : store.projectByRoot(root);
      if (other && other.id !== projectId && !other.archived) throw new DomainError("conflict", "Another T3 project already uses this folder");
      const fields = {
        ...(title !== undefined && { title }),
        ...(root !== undefined && root !== normalizeFolder(current.workspaceRoot ?? "", "") && { workspaceRoot: root }),
        ...(icon !== undefined && { projectIcon: icon }),
      };
      if (Object.keys(fields).length === 0) return;
      const mutation = { type: "project.update" as const, projectId, ...fields };
      try {
        await t3(port.mutateProject(mutation, newId()));
      } catch (error) {
        const reason = error instanceof IntegrationError ? error.reason : undefined;
        if (reason === "WorkspaceRootNotExistsError") throw new DomainError("invalid", "This folder does not exist");
        if (reason === "WorkspaceRootNotDirectoryError") throw new DomainError("invalid", "This path is a file, not a folder");
        if (reason === "ProjectConflictError") throw new DomainError("conflict", "Another T3 project already uses this folder");
        if (reason === "ProjectNotFoundError") throw new DomainError("not-found", "Project not found");
        throw error;
      }
    },

    async deleteProject(projectId) {
      knownProject(projectId);
      try {
        await t3(port.mutateProject({ type: "project.delete", projectId, force: true }, newId()));
      } catch (error) {
        if (error instanceof IntegrationError && error.reason === "ProjectNotFoundError") throw new DomainError("not-found", "Project not found");
        throw error;
      }
    },

    projectIcons: projectIconChoices,

    async browseFolders(path) {
      const root = normalizeFolder(path, home);
      const [browsed, [kind]] = await Promise.all([
        // A bare "~" lists the home folder, not its siblings.
        t3(port.browseFolders(expandHome(path.trim() === "~" ? "~/" : path, home))).catch((error) => {
          if (error instanceof IntegrationError && error.reason === "read_directory_failed") return { entries: [] };
          throw error;
        }),
        t3(port.pathKinds([root])),
      ]);
      const typed = path.slice(path.lastIndexOf("/") + 1);
      const entries = browsed.entries
        .filter((entry) => typed.startsWith(".") || !entry.name.startsWith("."))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_FOLDERS)
        .map((entry) => ({ name: entry.name, path: entry.fullPath }));
      return { path: root, kind: kind === "directory" ? "directory" : kind === null ? "missing" : "file", entries };
    },

    async projectRefs(projectId, { query, cursor }) {
      const cwd = folderOf(knownProject(projectId));
      const raw = await t3(port.listRefs(cwd, { limit: REFS_PAGE, ...(query && { query }), ...(cursor !== undefined && { cursor }) }));
      if (!raw.isRepo) return { isRepo: false, hasPrimaryRemote: false, refs: [], nextCursor: null, totalCount: 0 };
      const refs = raw.refs.map((ref) => ({
        name: ref.name,
        remote: ref.isRemote === true,
        ...(ref.remoteName ? { remoteName: ref.remoteName } : {}),
        current: ref.current === true,
        isDefault: ref.isDefault === true,
        worktreePath: ref.worktreePath ?? null,
      }));
      return { isRepo: true, hasPrimaryRemote: raw.hasPrimaryRemote === true, refs, nextCursor: raw.nextCursor ?? null, totalCount: raw.totalCount ?? refs.length };
    },

    async projectVcsStatus(projectId) {
      const raw = await t3(port.vcsStatus(folderOf(knownProject(projectId))));
      if (!raw.isRepo) return { isRepo: false, hasPrimaryRemote: false, branch: null, hasChanges: false };
      return { isRepo: true, hasPrimaryRemote: raw.hasPrimaryRemote === true, branch: raw.refName ?? null, hasChanges: raw.hasWorkingTreeChanges === true };
    },

    async createThread(create, images, uploads) {
      const projectId = create.projectId || (await t3(port.ensureScratchProject()));
      return launch({ ...create, projectId }, images, uploads, true);
    },

    async sendMessage(threadId, body, images, uploads) {
      const thread = store.thread(threadId);
      const active = thread !== undefined && ACTIVE_STATUSES.has(thread.status);
      const steer = body.mode === "steer";
      const dispatchMode: DispatchMode = active && !steer ? { type: "queue_after_active" } : { type: "start_immediately" };
      await send(messageCommand(threadId, body.text, await outgoing(threadId, images, uploads), { mode: dispatchMode, steer }));
    },

    async changeSettings(threadId, settings) {
      if (settings.modelSelection) await send(modelSelectionCommand(threadId, settings.modelSelection));
      if (settings.runtimeMode) await send(runtimeModeCommand(threadId, settings.runtimeMode));
    },

    async interrupt(threadId) {
      const runId = await activeRunId(threadId);
      if (runId) return send(interruptCommand(threadId, runId));
      // Like T3 Code: with no active run, stop the thread (and its background tasks).
      if (await canStopThread()) return send(threadStopCommand(threadId));
      const lastRunId = store.backgroundTasks(threadId).length ? (await t3(port.threadProjection(threadId))).runs?.at(-1)?.id : undefined;
      if (!lastRunId) throw new DomainError("conflict", "No active run to interrupt");
      await send(interruptCommand(threadId, lastRunId));
    },

    // The server picks the command: the button label can be one reload late.
    async sendQueued(threadId, runId) {
      const projection = await queuedRun(threadId, runId);
      // The fresh projection first: after a Stop, the shell can still name the stopped run.
      const target = projection.runs?.findLast((run) => RUNNING_RUN_STATUSES.has(run.status ?? ""))?.id ?? (await activeRunId(threadId, projection));
      await send(target ? promoteQueuedCommand(threadId, runId, target) : startQueuedCommand(threadId, runId));
    },

    async editQueued(threadId, runId, text) {
      await queuedRun(threadId, runId);
      await send(editQueuedCommand(threadId, runId, text));
    },

    async cancelQueued(threadId, runId) {
      await queuedRun(threadId, runId);
      await send(cancelQueuedCommand(threadId, runId));
    },

    async stopSubagent(threadId, subagentId) {
      const { subagents = [] } = await t3(port.threadProjection(threadId));
      const subagent = subagents.find((raw) => raw.id === subagentId);
      if (!subagent) throw new DomainError("not-found", "Unknown subagent");
      if (!subagent.runId || subagentStatus(subagent) !== "running") throw new DomainError("conflict", "This subagent is not running");
      const stop = send(subagentStopCommand(threadId, subagent.runId, subagentId));
      if (subagent.origin !== "app_owned" || !subagent.childThreadId) return stop;
      // Like T3 Code: a refused subagent.stop must not leave the child thread running.
      await stop.catch(() => undefined);
      const child = subagent.childThreadId;
      if (await canStopThread()) return send(threadStopCommand(child));
      const childRunId = await activeRunId(child);
      if (childRunId) await send(interruptCommand(child, childRunId));
    },

    async respond(threadId, requestId, answer) {
      await send("decision" in answer ? approvalCommand(threadId, requestId, answer.decision) : userInputCommand(threadId, requestId, answer.answers));
    },

    async answerSecret(threadId, itemId, answer) {
      try {
        await t3(port.answerSecretRequest(threadId, itemId, "secret" in answer ? { type: "save", secret: answer.secret } : { type: "decline" }));
      } catch (error) {
        if (!(error instanceof IntegrationError)) throw error;
        if (error.reason === "not_found") throw new DomainError("not-found", error.message);
        if (error.reason === "already_answered" || error.reason === "agent_stopped") throw new DomainError("conflict", error.message);
        throw error;
      }
    },

    async dismiss(threadId, requestId) {
      await send(dismissCommand(threadId, requestId));
    },

    async rewind(threadId, messageId, restoreFiles) {
      const projection = await t3(port.threadProjection(threadId));
      if (store.thread(threadId)?.activeRunId || (projection.runs ?? []).some((run) => RUNNING_RUN_STATUSES.has(run.status ?? ""))) throw new DomainError("conflict", "Stop the run before editing from here");
      const point = rewindPoints(projection).get(messageId);
      if (!point) throw new DomainError("conflict", "This message cannot be rewound");
      await send(rollbackCommand(threadId, point, restoreFiles));
    },

    async settle(threadId) {
      await send(settleCommand(threadId));
    },

    async unsettle(threadId) {
      await send(unsettleCommand(threadId));
    },

    async assign(body, images, uploads) {
      const issue = await findIssue(body.issueId);
      let projectId: string;
      if (body.projectId) {
        const project = store.project(body.projectId);
        if (!project) throw new DomainError("conflict", "T3 project not found");
        projectId = project.id;
      } else projectId = await t3(port.ensureScratchProject());
      // The agent always gets the issue link, after the user's own instructions if any.
      const reference = `Linear issue ${issue.identifier}: ${issue.url}`;
      const instructions = body.text.trim();
      const text = instructions ? `${instructions}\n\n${reference}` : `Handle Linear issue ${issue.identifier}: ${issue.url}`;
      const create = {
        projectId,
        title: `${issue.identifier} ${issue.title}`,
        text,
        modelSelection: body.modelSelection,
        ...(body.runtimeMode && { runtimeMode: body.runtimeMode }),
        ...(body.workspace && { workspace: body.workspace }),
        ...(body.interactionMode && { interactionMode: body.interactionMode }),
      };
      return launch(create, images, uploads, false);
    },
  };
}

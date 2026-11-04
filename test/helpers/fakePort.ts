import type { AssetResource, Command, FileUpload, ImageUpload, RawConfig, RawProjection, RawScheduledTask, RawSearchMatch, RawTurnItem, SearchEntriesResponse, SecretAnswer, ShellItem, T3Port } from "../../src/integrations/t3/schemas.ts";

/** In-memory T3: records commands, uploads and shell subscriptions; each answer can be swapped. */
export class FakePort implements T3Port {
  commands: Command[] = [];
  uploads: Array<{ threadId: string; messageId: string; images: ImageUpload[] }> = [];
  subscriptions: Array<{ onItems(items: ShellItem[]): void; onEnd(error?: Error): void; cancelled: boolean }> = [];
  projection: RawProjection = {};
  assets: AssetResource[] = [];
  ranges: Array<string | undefined> = [];
  assetFileName = "image.png";
  assetType = "image/png";
  searchCalls: Array<{ query: string; limit?: number }> = [];
  searchResult: RawSearchMatch[] = [];
  turnItems: Record<string, RawTurnItem> = {};
  turnItemCalls: Array<{ threadId: string; itemId: string }> = [];
  entriesCalls: Array<{ cwd: string; query: string; limit: number }> = [];
  entries: SearchEntriesResponse = { entries: [], truncated: false };
  fileUploads: FileUpload[] = [];
  deletedAttachments: string[] = [];
  scheduledTasks: RawScheduledTask[] = [];
  scheduledTasksError: Error | null = null;
  deletedTasks: string[] = [];
  deleteError: Error | null = null;
  renamedTasks: { id: string; title: string }[] = [];
  renameError: Error | null = null;
  secretAnswers: Array<{ threadId: string; turnItemId: string; answer: SecretAnswer }> = [];
  secretError: Error | null = null;
  dispatchError: Error | null = null;
  projectionError: Error | null = null;
  projectionCalls = 0;
  config: () => Promise<RawConfig> = async () => ({ providers: [], environment: { serverVersion: "1.0.0", orchestrationProtocolVersion: 2 } });

  async threadProjection(): Promise<RawProjection> {
    this.projectionCalls++;
    if (this.projectionError) throw this.projectionError;
    return this.projection;
  }

  async dispatch(command: Command) {
    if (this.dispatchError) throw this.dispatchError;
    this.commands.push(command);
    return { sequence: 1 };
  }

  async answerSecretRequest(threadId: string, turnItemId: string, answer: SecretAnswer) {
    if (this.secretError) throw this.secretError;
    this.secretAnswers.push({ threadId, turnItemId, answer });
  }

  async listScheduledTasks() {
    if (this.scheduledTasksError) throw this.scheduledTasksError;
    return this.scheduledTasks;
  }

  async deleteScheduledTask(id: string) {
    if (this.deleteError) throw this.deleteError;
    this.deletedTasks.push(id);
  }

  async renameScheduledTask(id: string, title: string) {
    if (this.renameError) throw this.renameError;
    this.renamedTasks.push({ id, title });
  }

  async searchThreads(query: string, limit?: number) {
    this.searchCalls.push({ query, ...(limit !== undefined && { limit }) });
    return this.searchResult;
  }

  async turnItem(threadId: string, itemId: string) {
    this.turnItemCalls.push({ threadId, itemId });
    return this.turnItems[itemId] ?? null;
  }

  async searchEntries(cwd: string, query: string, limit: number) {
    this.entriesCalls.push({ cwd, query, limit });
    return this.entries;
  }

  async uploadAttachment(upload: FileUpload) {
    this.fileUploads.push(upload);
    return `file-${this.fileUploads.length}`;
  }

  async deleteAttachment(attachmentId: string) {
    this.deletedAttachments.push(attachmentId);
  }

  getConfig() {
    return this.config();
  }

  async persistAttachments(threadId: string, messageId: string, images: ImageUpload[]) {
    this.uploads.push({ threadId, messageId, images });
    return images.map((image, index) => ({ type: "image", id: `stored-${index}`, name: image.name, mimeType: image.mimeType, sizeBytes: image.sizeBytes }));
  }

  async ensureScratchProject() {
    return "scratch-project";
  }

  async fetchAsset(resource: AssetResource, range?: string) {
    this.ranges.push(range);
    this.assets.push(resource);
    return { response: new Response("bytes", { headers: { "content-type": this.assetType } }), fileName: this.assetFileName };
  }

  subscribeShell(onItems: (items: ShellItem[]) => void, onEnd: (error?: Error) => void) {
    const subscription = { onItems, onEnd, cancelled: false };
    this.subscriptions.push(subscription);
    return {
      cancel() {
        subscription.cancelled = true;
      },
    };
  }
}

import type { AssetResource, Command, ImageUpload, RawConfig, RawProjection, ShellItem, T3Port } from "../../src/integrations/t3/schemas.ts";

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
  dispatchError: Error | null = null;
  projectionError: Error | null = null;
  config: () => Promise<RawConfig> = async () => ({ providers: [], environment: { serverVersion: "1.0.0", orchestrationProtocolVersion: 2 } });

  async threadProjection(): Promise<RawProjection> {
    if (this.projectionError) throw this.projectionError;
    return this.projection;
  }

  async dispatch(command: Command) {
    if (this.dispatchError) throw this.dispatchError;
    this.commands.push(command);
    return { sequence: 1 };
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

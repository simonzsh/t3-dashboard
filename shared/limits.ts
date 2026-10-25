import type { RuntimeMode } from "./threads.ts";

// Same limits on both sides: T3 takes images of up to 10 MB, and a message body stays under 25 MB.
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE_BODY_BYTES = 25 * 1024 * 1024;
export const IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export const RUNTIME_MODES: RuntimeMode[] = ["approval-required", "auto-accept-edits", "auto", "full-access"];
export const isRuntimeMode = (value: unknown): value is RuntimeMode => RUNTIME_MODES.includes(value as RuntimeMode);

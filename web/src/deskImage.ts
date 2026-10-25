import { MAX_IMAGE_SIDE, fitWithin } from "./deskBackground.ts";

const JPEG_QUALITY = 0.8;

// Shrinks a local image in the browser so it fits in localStorage as a JPEG data URL.
export async function imageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This file is not an image the browser can read.");
  });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

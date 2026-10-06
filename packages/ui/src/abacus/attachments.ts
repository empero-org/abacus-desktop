// Files the person attaches to a prompt. Images are read into data URLs,
// shrunk first when they are larger than any model looks at. Other files go
// as text: by path when they have one on disk (the app server reads them and
// names them by their place in the workspace), otherwise read here.

export type Attachment =
  | { id: string; kind: "image"; name: string; url: string }
  | { id: string; kind: "file"; name: string; path: string }
  | { id: string; kind: "file"; name: string; text: string };

/** The CLI's cap for one file attached as text. */
export const MAX_TEXT_BYTES = 256_000;

/** The types every provider abacus talks to accepts. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** Past this edge length models downscale anyway; sending more only costs upload time. */
export const MAX_EDGE = 2048;
/** The CLI's cap per image. */
export const MAX_BYTES = 8_000_000;

export function isAttachableImage(file: { type: string }): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(file.type);
}

/** The size an image is scaled to so its longer edge fits `max`, or null when it already fits. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_EDGE,
): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (longest <= max) return null;
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Bytes a base64 data URL decodes to. */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  return Math.floor(((url.length - comma - 1) * 3) / 4);
}

let counter = 0;

/**
 * Read an image file into an attachment. A large still image is redrawn to fit
 * MAX_EDGE (a GIF is left alone, so an animation is not flattened); anything
 * still over the cap is refused with a reason the person can act on.
 */
export async function readImage(file: File): Promise<Attachment> {
  if (!isAttachableImage(file))
    throw new Error(`${file.name || "That file"} is not a PNG, JPEG, GIF or WebP image`);
  let url = await asDataUrl(file);
  if (file.type !== "image/gif") url = (await shrink(file)) ?? url;
  if (dataUrlBytes(url) > MAX_BYTES)
    throw new Error(`${file.name || "The image"} is larger than 8 MB`);
  counter += 1;
  return { id: `attachment-${counter}`, kind: "image", url, name: file.name || "Pasted image" };
}

/** Whether bytes look like text: no NUL in what was read. */
export function looksLikeText(bytes: Uint8Array): boolean {
  return !bytes.includes(0);
}

/**
 * Read any file into an attachment: an image as an image, anything else as
 * text. Binary and oversized files are refused here, before the prompt is
 * sent, with a reason the person can act on.
 */
export async function readAttachment(file: File, path: string | null): Promise<Attachment> {
  if (isAttachableImage(file)) return readImage(file);
  const name = file.name || "Pasted text";
  if (file.size > MAX_TEXT_BYTES) {
    throw new Error(
      `${name} is larger than ${MAX_TEXT_BYTES / 1000} KB; ask abacus to read it instead`,
    );
  }
  if (!looksLikeText(new Uint8Array(await file.slice(0, 8192).arrayBuffer()))) {
    throw new Error(`${name} looks binary; only text files and images can be attached`);
  }
  counter += 1;
  const id = `attachment-${counter}`;
  return path
    ? { id, kind: "file", name, path }
    : { id, kind: "file", name, text: await file.text() };
}

/** An attachment as an app server `turn/start` input part. */
export function inputPart(attachment: Attachment): Record<string, string> {
  if (attachment.kind === "image") return { type: "image", url: attachment.url };
  if ("path" in attachment) return { type: "localFile", path: attachment.path };
  return { type: "file", name: attachment.name, text: attachment.text };
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("could not read the image"));
    reader.readAsDataURL(blob);
  });
}

async function shrink(file: File): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const size = fitWithin(bitmap.width, bitmap.height);
  if (!size) {
    bitmap.close();
    return null;
  }
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  // Photos stay JPEG; screenshots and diagrams stay lossless.
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  return asDataUrl(await canvas.convertToBlob({ type, quality: 0.9 }));
}

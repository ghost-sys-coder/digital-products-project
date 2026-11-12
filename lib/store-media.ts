// Store media (images, GIFs and short videos) in the public storefront bucket, per product:
// <store>/<product>/media/<random>.<ext>. Shared by the admin editor and the server.

export type StoreMediaKind = "image" | "video";
export type StoreMediaFile = { path: string; kind: StoreMediaKind; size: number; createdAt: string; poster: string | null };

const MB = 1024 * 1024;
export const STORE_MEDIA_TYPES = {
  png: { kind: "image", contentType: "image/png", maxBytes: 10 * MB },
  jpg: { kind: "image", contentType: "image/jpeg", maxBytes: 10 * MB },
  webp: { kind: "image", contentType: "image/webp", maxBytes: 10 * MB },
  avif: { kind: "image", contentType: "image/avif", maxBytes: 10 * MB },
  // GIFs are served as-is (they can't be optimised), so keep them small.
  gif: { kind: "image", contentType: "image/gif", maxBytes: 5 * MB },
  mp4: { kind: "video", contentType: "video/mp4", maxBytes: 25 * MB },
  webm: { kind: "video", contentType: "video/webm", maxBytes: 25 * MB },
} as const satisfies Record<string, { kind: StoreMediaKind; contentType: string; maxBytes: number }>;
export type StoreMediaExtension = keyof typeof STORE_MEDIA_TYPES;
export const STORE_MEDIA_ACCEPT = ".png,.jpg,.jpeg,.webp,.avif,.gif,.mp4,.webm";

/** The extension of a file name or path, normalised (jpeg → jpg). Null when not a store media type. */
export function mediaExtension(name: string): StoreMediaExtension | null {
  const raw = name.split(".").pop()?.toLowerCase() ?? "";
  const extension = raw === "jpeg" ? "jpg" : raw;
  return extension in STORE_MEDIA_TYPES ? extension as StoreMediaExtension : null;
}
export function mediaKind(path: string): StoreMediaKind | null {
  const extension = mediaExtension(path);
  return extension ? STORE_MEDIA_TYPES[extension].kind : null;
}
export function formatBytes(bytes: number) {
  return bytes >= MB ? `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why a file can't be uploaded, in the owner's words; null when it can. */
export function mediaUploadProblem(name: string, size: number) {
  const extension = mediaExtension(name);
  if (/\.(mov|heic|hevc|m4v)$/i.test(name)) return `${name}: convert it to MP4 (H.264) or JPEG first. iPhone formats don't play in every browser.`;
  if (/\.svg$/i.test(name)) return `${name}: SVG isn't supported. Upload a PNG or WebP instead.`;
  if (!extension) return `${name}: upload a PNG, JPEG, WebP, AVIF or GIF image, or an MP4 or WebM video.`;
  if (!size) return `${name} is empty.`;
  const { maxBytes, kind } = STORE_MEDIA_TYPES[extension];
  if (size > maxBytes) {
    return extension === "gif" ? `${name} is ${formatBytes(size)}. GIFs must be ${formatBytes(maxBytes)} or smaller; an MP4 of the same clip is usually 5–10× lighter.`
      : `${name} is ${formatBytes(size)}. ${kind === "video" ? "Videos" : "Images"} must be ${formatBytes(maxBytes)} or smaller.`;
  }
  return null;
}

/** Posters the editor generates for a video sit beside it: clip.mp4 → clip.poster.webp. */
export function posterPathFor(videoPath: string, extension: "webp" | "jpg" | "png") {
  return videoPath.replace(/\.(mp4|webm)$/i, `.poster.${extension}`);
}
export function isGeneratedPoster(path: string) { return /\.poster\.(webp|jpg|png)$/i.test(path); }
/** A video's poster in a listing: one the editor generated, or a "-poster" image uploaded beside it. */
export function findPoster(videoPath: string, paths: Set<string>) {
  const base = videoPath.replace(/\.(mp4|webm)$/i, "");
  for (const candidate of ["webp", "jpg", "png"].flatMap((extension) => [`${base}.poster.${extension}`, `${base}-poster.${extension}`])) {
    if (paths.has(candidate)) return candidate;
  }
  return null;
}

/** Checks a file's first bytes match its extension, so a renamed file can't pose as an image or video. */
export function sniffMedia(bytes: Uint8Array, extension: StoreMediaExtension) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  switch (extension) {
    case "png": return bytes[0] === 0x89 && ascii(1, 4) === "PNG";
    case "jpg": return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "gif": return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    case "avif": return ascii(4, 8) === "ftyp" && /avi[fs]/.test(ascii(8, Math.min(bytes.length, 40)));
    case "mp4": return ascii(4, 8) === "ftyp";
    case "webm": return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
}

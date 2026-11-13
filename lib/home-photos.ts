import "server-only";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Lifestyle photos for the studio homepage, saved by the owner in public/home (prompts for creating them
// are in docs/homepage-photos.md). Every photo is optional: until its file exists, the section that uses
// it keeps its plain design. next.config.ts bundles public/home with the code that reads it, so this
// also works on Vercel, where public files otherwise live only on the CDN.
//
// Photos are served from /api/home-photo/<name>/<fingerprint of the file>. Replacing a photo changes its
// address, so resized copies cached by next/image are never shown in place of the new one.

const PHOTOS = {
  templates: { file: "hands-template", alt: "Hands marking up printed planning templates beside a laptop" },
  freelancer: { file: "freelancer", alt: "A freelance designer reviewing a printed checklist in a bright home studio" },
  manager: { file: "manager", alt: "A team lead talking through a one-page plan with two colleagues" },
  desk: { file: "studio-desk", alt: "A calm, tidy studio desk in morning light" },
  night: { file: "night-room", alt: "" },
} as const;

const TYPES = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", avif: "image/avif" } as const;

export type HomePhotoName = keyof typeof PHOTOS;
export type HomePhoto = { src: string; alt: string };

const fingerprints = new Map<string, string>();

function locate(name: HomePhotoName) {
  const folder = join(process.cwd(), "public", "home");
  for (const extension of Object.keys(TYPES) as (keyof typeof TYPES)[]) {
    const path = join(folder, `${PHOTOS[name].file}.${extension}`);
    if (!existsSync(path)) continue;
    const stats = statSync(path);
    const key = `${path}:${stats.size}:${stats.mtimeMs}`;
    let version = fingerprints.get(key);
    if (!version) {
      version = createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
      fingerprints.set(key, version);
    }
    return { path, type: TYPES[extension], version };
  }
  return null;
}

/** The photos that have been saved, by name. Checked per request, so a new photo shows without a code change. */
export function homePhotos(): Partial<Record<HomePhotoName, HomePhoto>> {
  const found: Partial<Record<HomePhotoName, HomePhoto>> = {};
  for (const name of Object.keys(PHOTOS) as HomePhotoName[]) {
    const photo = locate(name);
    if (photo) found[name] = { src: `/api/home-photo/${name}/${photo.version}`, alt: PHOTOS[name].alt };
  }
  return found;
}

/** The photo's bytes, only for its current fingerprint: old or invented addresses get nothing. */
export function readHomePhoto(name: string, version: string) {
  if (!Object.hasOwn(PHOTOS, name)) return null;
  const photo = locate(name as HomePhotoName);
  if (!photo || photo.version !== version) return null;
  return { body: new Uint8Array(readFileSync(photo.path)), type: photo.type };
}

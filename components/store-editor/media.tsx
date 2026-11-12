"use client";
import { createContext, useContext, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Film, ImagePlus, Play, Trash2, Upload, X } from "lucide-react";
import type { Media } from "@/lib/store-page";
import { formatBytes, isGeneratedPoster, mediaKind, mediaUploadProblem, STORE_MEDIA_ACCEPT, type StoreMediaFile, type StoreMediaKind } from "@/lib/store-media";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Uploading = { id: string; name: string; progress: number; stage: string };
type MediaApi = {
  productId: string; mediaBase: string; files: StoreMediaFile[]; uploading: Uploading[];
  /** Paths used anywhere in the unsaved editor state. */
  used: (path: string) => boolean;
  upload: (files: File[]) => Promise<StoreMediaFile[]>;
  remove: (file: StoreMediaFile) => Promise<void>;
};
const MediaContext = createContext<MediaApi | null>(null);
export function useMedia() {
  const api = useContext(MediaContext);
  if (!api) throw new Error("useMedia needs a MediaProvider");
  return api;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/admin/stores/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}

/** PUT with progress: videos can take a while on mobile data, so show how far along they are. */
function put(url: string, file: Blob, contentType: string, upsert: boolean, onProgress: (share: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.setRequestHeader("x-upsert", String(upsert));
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("The upload failed. Please try again."));
    request.onerror = () => reject(new Error("The upload stopped. Check your connection and try again."));
    request.send(file);
  });
}

/** A still from about a tenth of the way in (the first frame is often black), as WebP or JPEG. */
async function capturePoster(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("unreadable"));
      setTimeout(() => reject(new Error("timeout")), 15_000);
    });
    const target = Math.min(1, (Number.isFinite(video.duration) ? video.duration : 0) * 0.1);
    if (target > 0) {
      video.currentTime = target;
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); setTimeout(resolve, 5_000); });
    }
    if (!video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    // Safari can't encode WebP and quietly returns PNG; JPEG is smaller for photos.
    return webp?.type === "image/webp" ? webp : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch { return null; } finally {
    video.removeAttribute("src"); video.load();
    URL.revokeObjectURL(url);
  }
}

export function MediaProvider({ productId, mediaBase, initial, used, children }: {
  productId: string; mediaBase: string; initial: StoreMediaFile[]; used: (path: string) => boolean; children: React.ReactNode;
}) {
  const [files, setFiles] = useState(initial);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const queue = useRef(Promise.resolve());
  const track = (id: string, patch: Partial<Uploading>) => setUploading((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item));

  async function uploadOne(file: File, id: string): Promise<StoreMediaFile> {
    const prepared = await call<{ signedUrl: string; path: string; contentType: string }>({ action: "prepare", productId, filename: file.name, size: file.size });
    await put(prepared.signedUrl, file, prepared.contentType, false, (share) => track(id, { progress: share }));
    track(id, { stage: "Checking", progress: 1 });
    const saved = await call<StoreMediaFile>({ action: "confirm", productId, path: prepared.path });
    if (saved.kind === "video") {
      track(id, { stage: "Making poster" });
      const still = await capturePoster(file);
      if (still) {
        try {
          const extension = still.type === "image/webp" ? "webp" : "jpg";
          const poster = await call<{ signedUrl: string; path: string; contentType: string }>({ action: "prepare", productId, filename: `poster.${extension}`, size: still.size, posterFor: saved.path });
          await put(poster.signedUrl, still, poster.contentType, true, () => {});
          await call({ action: "confirm", productId, path: poster.path });
          saved.poster = poster.path;
        } catch { /* The video still works; it just shows its first frame while loading. */ }
      }
    }
    return saved;
  }

  async function upload(chosen: File[]) {
    const accepted: { file: File; id: string }[] = [];
    for (const file of chosen) {
      const problem = mediaUploadProblem(file.name, file.size);
      if (problem) toast.error("Can't upload this file", { description: problem });
      else accepted.push({ file, id: crypto.randomUUID() });
    }
    if (!accepted.length) return [];
    setUploading((list) => [...list, ...accepted.map(({ file, id }) => ({ id, name: file.name, progress: 0, stage: "Waiting" }))]);
    const results: StoreMediaFile[] = [];
    // One at a time: kinder to slow connections, and progress stays meaningful.
    const run = queue.current.then(async () => {
      for (const { file, id } of accepted) {
        track(id, { stage: "Uploading" });
        try {
          const saved = await uploadOne(file, id);
          results.push(saved);
          setFiles((list) => [saved, ...list]);
        } catch (error) {
          toast.error(`${file.name} didn't upload`, { description: (error as Error).message });
        } finally {
          setUploading((list) => list.filter((item) => item.id !== id));
        }
      }
    });
    queue.current = run.catch(() => {});
    await run;
    if (results.length) toast.success(results.length === 1 ? "Uploaded" : `${results.length} files uploaded`);
    return results;
  }

  async function remove(file: StoreMediaFile) {
    await call({ action: "delete", productId, path: file.path });
    setFiles((list) => list.filter((item) => item.path !== file.path));
    toast.success("File deleted");
  }

  return <MediaContext.Provider value={{ productId, mediaBase, files, uploading, used, upload, remove }}>{children}</MediaContext.Provider>;
}

/** A thumbnail for an image, GIF or video. */
export function MediaThumb({ path, poster, sizes = "160px", alt = "" }: { path: string; poster?: string | null; sizes?: string; alt?: string }) {
  const { mediaBase } = useMedia();
  const kind = mediaKind(path);
  if (kind === "video") {
    return <span className="se-thumb">
      {poster ? <Image src={mediaBase + poster} alt={alt} fill sizes={sizes} />
        : <video src={`${mediaBase}${path}#t=0.5`} muted playsInline preload="metadata" aria-label={alt || undefined} />}
      <span className="se-thumb-badge"><Play size={11} aria-hidden />Video</span>
    </span>;
  }
  const gif = /\.gif$/i.test(path);
  return <span className="se-thumb">
    <Image src={mediaBase + path} alt={alt} fill sizes={sizes} unoptimized={gif} />
    {gif && <span className="se-thumb-badge">GIF</span>}
  </span>;
}

function UploadButton({ label = "Upload", multiple = true, onUploaded, accept }: { label?: string; multiple?: boolean; onUploaded?: (files: StoreMediaFile[]) => void; accept?: readonly StoreMediaKind[] }) {
  const { upload } = useMedia();
  const input = useRef<HTMLInputElement>(null);
  const filter = accept?.length === 1 ? (accept[0] === "video" ? ".mp4,.webm" : ".png,.jpg,.jpeg,.webp,.avif,.gif") : STORE_MEDIA_ACCEPT;
  return <>
    <button type="button" className="button secondary small" onClick={() => input.current?.click()}><Upload size={15} aria-hidden />{label}</button>
    <input ref={input} type="file" className="se-file-input" hidden multiple={multiple} accept={filter} onChange={async (event) => {
      const chosen = [...(event.target.files ?? [])];
      event.target.value = "";
      const saved = await upload(chosen);
      if (saved.length) onUploaded?.(saved);
    }} />
  </>;
}

/** The store's media: drop zone, upload progress, and a grid to pick from or tidy up. */
export function MediaLibrary({ accept, selected = [], onToggle, onUploaded }: {
  accept?: readonly StoreMediaKind[]; selected?: string[]; onToggle?: (file: StoreMediaFile) => void; onUploaded?: (files: StoreMediaFile[]) => void;
}) {
  const { files, uploading, used, upload, remove } = useMedia();
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<StoreMediaFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const shown = files.filter((file) => !isGeneratedPoster(file.path) && (!accept || accept.includes(file.kind)));
  const kinds = !accept || accept.length === 2 ? "images, GIFs or videos" : accept[0] === "video" ? "videos" : "images or GIFs";

  return <div className={`se-library${dragging ? " is-dragging" : ""}`}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={async (event) => {
      event.preventDefault(); setDragging(false);
      const saved = await upload([...event.dataTransfer.files]);
      if (saved.length) onUploaded?.(saved);
    }}>
    <div className="se-library-bar">
      <p>Drag {kinds} here, or <span className="se-nowrap">upload from your device.</span> <span className="se-hint">JPEG, PNG, WebP or AVIF up to 10 MB · GIF up to 5 MB · MP4 or WebM up to 25 MB</span></p>
      <UploadButton accept={accept} onUploaded={onUploaded} />
    </div>
    {shown.length || uploading.length ? <ul className="se-media-grid" role="list">
      {uploading.map((item) => <li key={item.id} className="se-media-tile is-uploading" aria-live="polite">
        <span className="se-thumb"><Film size={20} aria-hidden /></span>
        <span className="se-media-name">{item.name}</span>
        <span className="se-progress" role="progressbar" aria-label={`${item.stage} ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}><span style={{ width: `${Math.round(item.progress * 100)}%` }} /></span>
        <span className="se-media-meta">{item.stage}{item.stage === "Uploading" ? ` · ${Math.round(item.progress * 100)}%` : "…"}</span>
      </li>)}
      {shown.map((file) => {
        const isSelected = selected.includes(file.path);
        const inUse = used(file.path);
        return <li key={file.path} className={`se-media-tile${isSelected ? " is-selected" : ""}`}>
          {onToggle
            ? <button type="button" className="se-media-pick" aria-pressed={isSelected} onClick={() => onToggle(file)} aria-label={`${isSelected ? "Selected: " : "Choose "}${file.kind} ${file.path.split("/").pop()}`}>
                <MediaThumb path={file.path} poster={file.poster} />{isSelected && <span className="se-check"><Check size={14} aria-hidden /></span>}
              </button>
            : <MediaThumb path={file.path} poster={file.poster} />}
          <span className="se-media-meta">{formatBytes(file.size)}{inUse && <span className="se-chip">In use</span>}</span>
          {!onToggle && !inUse && <button type="button" className="se-icon-button se-media-delete" aria-label="Delete file" onClick={() => setConfirm(file)}><Trash2 size={14} aria-hidden /></button>}
        </li>;
      })}
    </ul> : <div className="se-empty"><ImagePlus size={26} aria-hidden /><p>No {kinds} yet.</p></div>}

    <AlertDialog open={!!confirm} onOpenChange={(open) => { if (!open && !deleting) setConfirm(null); }}>
      <AlertDialogContent className="confirm-dialog">
        <span className="confirm-dialog-icon danger"><Trash2 size={21} aria-hidden /></span>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this file?</AlertDialogTitle>
          <AlertDialogDescription>It isn&apos;t used anywhere in the editor. Deleting it can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="button secondary" disabled={deleting}>Keep file</AlertDialogCancel>
          <AlertDialogAction type="button" className="button danger" disabled={deleting} onClick={async () => {
            if (!confirm) return;
            setDeleting(true);
            try { await remove(confirm); setConfirm(null); } catch (error) { toast.error("Couldn't delete the file", { description: (error as Error).message }); }
            setDeleting(false);
          }}><Trash2 size={15} aria-hidden />{deleting ? "Deleting…" : "Delete file"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function PickerDialog({ open, onOpenChange, accept, multiple, onPick, title }: {
  open: boolean; onOpenChange: (open: boolean) => void; accept: readonly StoreMediaKind[]; multiple: boolean;
  onPick: (files: StoreMediaFile[]) => void; title: string;
}) {
  const [selected, setSelected] = useState<StoreMediaFile[]>([]);
  const finish = (files: StoreMediaFile[]) => { onPick(files); setSelected([]); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) setSelected([]); onOpenChange(next); }}>
    <DialogContent className="se-picker">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{multiple ? "Select one or more, or upload new files. Uploads are selected for you." : "Choose a file, or upload a new one."}</DialogDescription>
      </DialogHeader>
      <MediaLibrary accept={accept} selected={selected.map((file) => file.path)}
        onToggle={(file) => multiple ? setSelected((list) => list.some((item) => item.path === file.path) ? list.filter((item) => item.path !== file.path) : [...list, file]) : finish([file])}
        onUploaded={(files) => multiple ? setSelected((list) => [...list, ...files]) : finish(files.slice(0, 1))} />
      {multiple && <div className="se-picker-foot">
        <span className="muted">{selected.length ? `${selected.length} selected` : "Nothing selected"}</span>
        <button type="button" className="button primary small" disabled={!selected.length} onClick={() => finish(selected)}>Add {selected.length || ""} to gallery</button>
      </div>}
    </DialogContent>
  </Dialog>;
}

const kindLabel = (accept: readonly StoreMediaKind[]) => accept.length === 2 ? "image or video" : accept[0];
export function toMedia(file: StoreMediaFile): Media { return { path: file.path, kind: file.kind, alt: "", poster: file.kind === "video" ? file.poster : null }; }

/** One image or video slot, with its description for screen readers. */
export function MediaField({ label, help, value, accept, onChange, required }: {
  label: string; help?: string; value: Media | null; accept: readonly StoreMediaKind[]; onChange: (media: Media | null) => void; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { files } = useMedia();
  return <div className="se-field">
    <span className="se-label"><span className="se-label-text">{label}{!required && <span className="optional">Optional</span>}</span></span>
    {value ? <div className="se-media-slot">
      <MediaThumb path={value.path} poster={value.poster} sizes="96px" alt={value.alt} />
      <div className="se-media-slot-body">
        <label className="se-inline-label">Description for screen readers
          <input value={value.alt} maxLength={160} placeholder={value.kind === "video" ? "What happens in the clip" : "What the image shows"} onChange={(event) => onChange({ ...value, alt: event.target.value })} />
        </label>
        <div className="se-row-actions">
          <button type="button" className="se-text-button" onClick={() => setOpen(true)}>Replace</button>
          <button type="button" className="se-text-button danger" onClick={() => onChange(null)}>Remove</button>
          {value.kind === "video" && !value.poster && files.find((file) => file.path === value.path)?.poster && <button type="button" className="se-text-button" onClick={() => onChange({ ...value, poster: files.find((file) => file.path === value.path)!.poster })}>Add poster</button>}
        </div>
      </div>
    </div> : <button type="button" className="se-media-empty" onClick={() => setOpen(true)}><ImagePlus size={18} aria-hidden />Choose {kindLabel(accept)}</button>}
    {help && <span className="field-help">{help}</span>}
    <PickerDialog open={open} onOpenChange={setOpen} accept={accept} multiple={false} title={`Choose ${kindLabel(accept)}`}
      onPick={([file]) => file && onChange({ ...toMedia(file), alt: value?.path === file.path ? value.alt : "" })} />
  </div>;
}

/** An ordered gallery (the hero): reorder, describe and remove each item. */
export function MediaListField({ label, help, value, accept, max, onChange }: {
  label: string; help?: string; value: Media[]; accept: readonly StoreMediaKind[]; max: number; onChange: (media: Media[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const move = (from: number, to: number) => { const next = [...value]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next); };
  return <div className="se-field">
    <span className="se-label"><span className="se-label-text">{label}</span><span className="optional">{value.length} of {max}</span></span>
    {help && <span className="field-help se-help-top">{help}</span>}
    <ol className="se-gallery">
      {value.map((item, index) => <li key={`${item.path}-${index}`}>
        <MediaThumb path={item.path} poster={item.poster} sizes="140px" alt={item.alt} />
        {index === 0 && <span className="se-chip se-gallery-main">Main</span>}
        <input aria-label={`Description of gallery item ${index + 1}`} value={item.alt} maxLength={160} placeholder="Description" onChange={(event) => onChange(value.map((entry, position) => position === index ? { ...entry, alt: event.target.value } : entry))} />
        <div className="se-gallery-actions">
          <button type="button" className="se-icon-button" disabled={index === 0} aria-label={`Move item ${index + 1} earlier`} onClick={() => move(index, index - 1)}><ArrowLeft size={14} aria-hidden /></button>
          <button type="button" className="se-icon-button" disabled={index === value.length - 1} aria-label={`Move item ${index + 1} later`} onClick={() => move(index, index + 1)}><ArrowRight size={14} aria-hidden /></button>
          <button type="button" className="se-icon-button danger" aria-label={`Remove item ${index + 1}`} onClick={() => onChange(value.filter((_, position) => position !== index))}><X size={14} aria-hidden /></button>
        </div>
      </li>)}
      {value.length < max && <li><button type="button" className="se-media-empty tall" onClick={() => setOpen(true)}><ImagePlus size={18} aria-hidden />Add</button></li>}
    </ol>
    <PickerDialog open={open} onOpenChange={setOpen} accept={accept} multiple title="Add to the gallery"
      onPick={(files) => onChange([...value, ...files.map(toMedia)].slice(0, max))} />
  </div>;
}

/** A small image picker for variant images and the logo. */
export function ImagePathField({ label, value, onChange, help }: { label: string; value: string | null; onChange: (path: string | null) => void; help?: string }) {
  const [open, setOpen] = useState(false);
  return <div className="se-field se-image-path">
    <span className="se-label"><span className="se-label-text">{label}</span></span>
    <div className="se-image-path-row">
      {value ? <MediaThumb path={value} sizes="64px" /> : <span className="se-thumb is-empty"><ImagePlus size={16} aria-hidden /></span>}
      <div className="se-row-actions">
        <button type="button" className="se-text-button" onClick={() => setOpen(true)}>{value ? "Replace" : "Choose image"}</button>
        {value && <button type="button" className="se-text-button danger" onClick={() => onChange(null)}>Remove</button>}
      </div>
    </div>
    {help && <span className="field-help">{help}</span>}
    <PickerDialog open={open} onOpenChange={setOpen} accept={["image"]} multiple={false} title={`Choose ${label.toLowerCase()}`} onPick={([file]) => file && onChange(file.path)} />
  </div>;
}

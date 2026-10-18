"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, FileArchive, FileText, ImageIcon, Upload, X } from "lucide-react";
import type { DownloadAvailability } from "@/lib/product-files";

const MAX_FILE_SIZE = 3 * 1024 * 1024;

type Selection = { file: File; url: string | null };

export function ProductUploadField({ kind, existingName, existingCover, existingStatus = "unverified", disabled = false }: {
  kind: "download" | "cover";
  existingName?: string | null;
  existingCover?: string;
  existingStatus?: DownloadAvailability;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState("");
  const cover = kind === "cover";
  const attached = cover ? Boolean(existingCover) : Boolean(existingName) && existingStatus === "available";
  const missingSavedFile = !cover && Boolean(existingName) && existingStatus === "missing";
  const unverifiedSavedFile = !cover && Boolean(existingName) && existingStatus === "unverified";
  const preview = selection?.url ?? (cover ? existingCover : undefined);
  const fileType = selection?.file.name.split(".").pop()?.toUpperCase();
  const Icon = cover ? ImageIcon : fileType === "ZIP" ? FileArchive : FileText;

  useEffect(() => () => {
    if (selection?.url) URL.revokeObjectURL(selection.url);
  }, [selection]);

  function clearSelection() {
    if (input.current) {
      input.current.value = "";
      input.current.setCustomValidity("");
      input.current.focus();
    }
    setSelection(null);
    setError("");
  }

  return <div className={`product-upload ${disabled ? "is-disabled" : ""}`}>
    <label htmlFor={id} className={`upload-field ${selection || attached ? "has-file" : ""} ${error ? "has-error" : ""}`}>
      {cover && preview ? <Image className="upload-cover-preview" src={preview} alt={selection ? "Selected product cover preview" : "Current product cover"} width={640} height={400} unoptimized /> : <span className="upload-file-icon"><Icon size={28} aria-hidden="true" /></span>}
      <strong>{selection?.file.name ?? (cover ? (attached ? "Current product cover" : "Add a product cover") : (existingName || "Add your digital download"))}</strong>
      {selection ? <span>{fileType} · {selection.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(selection.file.size / 1024))} KB` : `${(selection.file.size / (1024 * 1024)).toFixed(2)} MB`}</span> : <span>{cover ? "PNG, JPEG, or WebP" : "PDF or ZIP"} · up to 3 MB</span>}
      <span className="upload-action"><Upload size={14} aria-hidden="true" />{selection || attached ? "Choose a different file" : "Choose file"}</span>
      <input ref={input} id={id} name={kind} type="file" disabled={disabled} accept={cover ? "image/png,image/jpeg,image/webp" : ".pdf,.zip"} aria-describedby={`${id}-status${error ? ` ${id}-error` : ""}`} aria-invalid={Boolean(error)} aria-label={cover ? "Product cover" : "Digital download"} onChange={(event) => {
        const field = event.currentTarget;
        const file = field.files?.[0];
        if (!file) { clearSelection(); return; }
        const supported = cover ? /\.(png|jpe?g|webp)$/i.test(file.name) : /\.(pdf|zip)$/i.test(file.name);
        const message = !supported ? (cover ? "Choose a PNG, JPEG, or WebP image." : "Choose a PDF or ZIP file.") : file.size === 0 ? "This file is empty. Choose a different file." : file.size > MAX_FILE_SIZE ? "This file is larger than 3 MB. Choose a smaller file." : "";
        field.setCustomValidity(message);
        setError(message);
        if (message) { field.value = ""; setSelection(null); return; }
        setSelection({ file, url: cover || /\.pdf$/i.test(file.name) ? URL.createObjectURL(file) : null });
      }} />
    </label>
    <div id={`${id}-status`} className="upload-status" role="status" aria-live="polite" aria-atomic="true">
      {!error && (selection ? <><CheckCircle2 size={15} aria-hidden="true" /><span>Ready to upload. Save product to {attached ? "replace the current file" : "attach this file"}.</span></> : attached ? <><CheckCircle2 size={15} aria-hidden="true" /><span>{cover ? "Your saved cover is attached." : "Your download is saved and ready for delivery."}</span></> : missingSavedFile ? <span className="upload-error">The saved download could not be found. Choose the PDF or ZIP again, then save your product.</span> : unverifiedSavedFile ? <span>We couldn&apos;t check the saved download. Reload the page or choose a replacement.</span> : <span>{cover ? "Choose an image to preview it here." : "Choose a file to see its details before uploading."}</span>)}
    </div>
    {error && <p id={`${id}-error`} className="upload-error" role="alert">{error}</p>}
    {(selection || error) && <div className="upload-controls">
      {!cover && selection?.url && <a href={selection.url} target="_blank" rel="noopener noreferrer" className="text-link">Preview PDF</a>}
      <button type="button" disabled={disabled} className="text-link" onClick={clearSelection}><X size={14} aria-hidden="true" />Clear selection</button>
    </div>}
  </div>;
}

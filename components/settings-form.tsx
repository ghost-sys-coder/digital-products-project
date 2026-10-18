"use client";
import { useState } from "react";
import { Save, Check } from "lucide-react";
import type { Store } from "@/lib/catalog.types";
import { useRouter } from "next/navigation";

export function SettingsForm({ store }: { store: Store }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  return <form className="workspace-panel form-panel settings-form" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save.");
      setFailed(false); setMessage("Your store settings are saved.");
      router.refresh();
    } catch (error) { setFailed(true); setMessage((error as Error).message); } finally { setPending(false); }
  }}><h2>The face of your studio</h2><p className="muted">These details appear on your storefront.</p><label>Store name<input name="name" defaultValue={store.name} maxLength={80} required /></label><label>Headline<input name="tagline" defaultValue={store.tagline} maxLength={160} /></label><label>Introduction<textarea name="bio" defaultValue={store.bio} rows={4} maxLength={1000} /></label><label>Support email<input name="support_email" type="email" defaultValue={store.support_email} maxLength={254} required /></label><label>Studio website <span className="optional">Optional</span><input name="website_url" type="url" defaultValue={store.website_url ?? ""} placeholder="https://yourstudio.com" maxLength={2000} /></label>{message && <p role="status" className={failed ? "form-error" : "save-success"}>{!failed && <Check size={16} />}{message}</p>}<button className="button primary" disabled={pending}><Save size={16} />{pending ? "Saving…" : "Save settings"}</button></form>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { slugify } from "@/lib/store-input";
import type { ThemeId } from "@/lib/store-themes";
import { TextField } from "./fields";
import { ThemePicker } from "./brand-tab";

/** Name, URL and theme: enough to create a draft store, then the editor takes over. */
export function NewStoreForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("clean-minimal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return <form className="se new-store" onSubmit={async (event) => {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", name, slug, theme }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Couldn't create the store. Please try again.");
      router.push(`/admin/products/${result.id}#product`);
    } catch (cause) { setError((cause as Error).message); setPending(false); }
  }}>
    <section className="workspace-panel form-panel">
      <div className="form-section-heading"><span className="step-number">01</span><div><h2>Name it</h2><p>You can change both later.</p></div></div>
      <TextField label="Product name" required max={120} value={name} placeholder="Nebula Galaxy Projector"
        onChange={(value) => { setName(value); if (!slugTouched) setSlug(slugify(value)); }} />
      <TextField label="Store URL" required max={80} prefix="/s/" value={slug} placeholder="nebula" help="Short and memorable works best in TikTok bios and captions."
        onChange={(value) => { setSlugTouched(true); setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />
    </section>
    <section className="workspace-panel form-panel">
      <div className="form-section-heading"><span className="step-number">02</span><div><h2>Pick a look</h2><p>Each theme sets the type, colours and shapes. You&apos;ll add your logo and colour next.</p></div></div>
      <ThemePicker value={theme} onChange={setTheme} />
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary" disabled={pending || !name.trim() || !slug}>{pending ? "Creating your store…" : <>Create store <ArrowRight size={16} aria-hidden /></>}</button>
    <p className="field-help">The store starts as a draft with a ready-made page layout. Only you can see it until you publish.</p>
  </form>;
}

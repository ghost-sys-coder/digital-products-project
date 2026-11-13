"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Save, FileText } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog.types";
import { CURRENCIES } from "@/lib/store-config";
import { ProductUploadField } from "@/components/product-upload-field";
import type { DownloadAvailability } from "@/lib/product-files";
import type { RelatedChoice } from "@/lib/related-products";
import { RelatedPicker } from "@/components/related-picker";
import { uploadProductFromBrowser, type UploadedProductFile } from "@/lib/upload-product.client";

export function ProductEditor({ product, id, related, downloadStatus = "unverified" }: { product: CatalogProduct | null; id: string; related: RelatedChoice[]; downloadStatus?: DownloadAvailability }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const uploadedFiles = useRef<Partial<Record<"download" | "cover", UploadedProductFile>>>({});
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  return <form className="product-editor" onSubmit={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      for (const kind of ["download", "cover"] as const) {
        const file = form.get(kind);
        if (file instanceof File && file.size) {
          setUploadStatus(kind === "cover" ? "Uploading your cover…" : "Uploading your download…");
          let uploaded = uploadedFiles.current[kind];
          if (!uploaded || uploaded.file !== file || uploaded.expiresAt <= Date.now()) {
            uploaded = await uploadProductFromBrowser(id, product?.revision ?? 0, kind, file);
            uploadedFiles.current[kind] = uploaded;
          }
          form.set(`${kind}_upload`, uploaded.receipt);
        }
        form.delete(kind);
      }
      setUploadStatus("Saving your product…");
      const response = await fetch("/api/admin/products", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save. Please try again.");
      toast.success(product ? "Product saved" : "Product created", { description: form.get("status") === "published" ? "Your product is ready on your storefront." : "Your draft is saved. Publish it whenever you’re ready.", duration: 4000 });
      router.push(`/admin/products/${data.id}?saved=1`); router.refresh();
      setPending(false);
    } catch (error) { setError((error as Error).message); setPending(false); }
  }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={product?.revision ?? 0} />
    <div className="editor-main"><section className="workspace-panel form-panel"><div className="form-section-heading"><span className="step-number">01</span><div><h2>The essentials</h2><p>Give your product a clear introduction.</p></div></div><label>Product name<input name="name" value={name} onChange={(event) => { setName(event.target.value); if (!product) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100)); }} required maxLength={120} placeholder="A name worth remembering" /></label><label>Product URL<div className="input-prefix"><span>/p/</span><input name="slug" value={slug} onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" required maxLength={100} placeholder="your-product" /></div></label><label>Short description<input name="tagline" defaultValue={product?.tagline} maxLength={200} placeholder="What will this help someone do?" /></label><label>Full description<textarea name="description" defaultValue={product?.description} maxLength={10000} rows={7} placeholder="Tell the story. Who is this for, what problem does it solve, and how will they use it?" /></label><label>What&apos;s included<textarea name="includes" defaultValue={product?.includes.join("\n")} rows={4} placeholder={"The practical guide\nEditable project templates\nA step-by-step checklist"} /><span className="field-help">One item per line, up to 12 items.</span></label></section>
    <section className="workspace-panel form-panel"><div className="form-section-heading"><span className="step-number">02</span><div><h2>The good stuff</h2><p>Upload what your customer will receive.</p></div></div>
      <ProductUploadField key={`download-${product?.revision ?? 0}`} kind="download" existingName={product?.download_filename} existingStatus={downloadStatus} disabled={pending} />
      <label>Template or resource folder URL <span className="optional">Optional</span><input name="templates_url" type="url" defaultValue={product?.templates_url ?? ""} placeholder="https://drive.google.com/drive/folders/…" maxLength={2000} /><span className="field-help">Delivered in the purchase email. Use a public HTTPS resource your buyer can open.</span></label>
      <ProductUploadField key={`cover-${product?.revision ?? 0}`} kind="cover" existingCover={product?.cover_path ? `/api/products/${product.id}/cover?preview=1&v=${product.revision}` : undefined} disabled={pending} />
      <p className="field-help">No cover? We&apos;ll use a simple studio cover with your product name.</p>
    </section>
    <section className="workspace-panel form-panel"><div className="form-section-heading"><span className="step-number">03</span><div><h2>Pairs well with</h2><p>Suggest up to four other products below this one&apos;s page. Leave it empty to keep the page on this product alone.</p></div></div>
      <RelatedPicker choices={related} initial={product?.related_ids ?? []} disabled={pending} />
    </section></div>
    <aside className="editor-aside"><section className="workspace-panel form-panel"><div className="form-section-heading"><span className="step-number">04</span><div><h2>Make it yours</h2><p>Price it. Publish it. Share it.</p></div></div><div className="form-columns"><label>Price<input name="price" inputMode="decimal" defaultValue={product?.price_amount === null || !product ? "" : (product.price_amount / 100).toFixed(2)} required pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="0.00" /></label><label>Currency<select name="currency" defaultValue={product?.currency ?? "usd"}>{CURRENCIES.map((currency) => <option value={currency} key={currency}>{currency.toUpperCase()}</option>)}</select></label></div><p className="field-help">One-time payment. Saving creates or updates the product and price in Stripe automatically.</p><label>Visibility<select name="status" defaultValue={product?.status ?? "draft"}><option value="draft">Draft — only visible to you</option><option value="published">Published — available to buy</option></select></label><label>Display order<input name="sort_order" type="number" min={-999999} max={999999} defaultValue={product?.sort_order ?? 0} /><span className="field-help">Lower numbers appear first.</span></label>{error && <p className="form-error" role="alert">{error}</p>}<button disabled={pending} className="button primary full-width"><Save size={17} />{pending ? uploadStatus || "Saving your product…" : "Save product"}</button></section><div className="editor-tip"><FileText size={20} /><h3>Ready when you are.</h3><p>Start with a draft. When the details and download are in place, switch to published and share your product link.</p><p>Existing purchases keep the files and resources saved at checkout.</p></div></aside>
  </form>;
}

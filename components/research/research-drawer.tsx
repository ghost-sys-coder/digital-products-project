"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { slugify } from "@/lib/store-input";
import {
  daysSince, STAGE_LABELS, STAGES, unitEconomics,
  type CjDetail, type CjProduct, type ResearchAd, type ResearchCard, type ResearchKind, type ResearchProduct, type ResearchSupplier, type Stage,
} from "@/lib/research.types";
import { centsInput, dollars, metaLibraryUrl, researchApi, toCents } from "./api";

type SupplierForm = { name: string; url: string; cost: string; shipping: string; shippingName: string; days: string; source: ResearchSupplier["source"]; id: string | null };
const supplierForm = (supplier: ResearchSupplier | null): SupplierForm => ({
  name: supplier?.name ?? "", url: supplier?.url ?? "", cost: centsInput(supplier?.cost ?? null), shipping: centsInput(supplier?.shipping ?? null),
  shippingName: supplier?.shippingName ?? "", days: supplier?.days ?? "", source: supplier?.source ?? "manual", id: supplier?.id ?? null,
});

const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Ad link"; } };

export function ResearchDrawer({ item, onClose, onSaved, onDeleted, cj }: {
  item: ResearchCard; onClose: () => void; onSaved: (item: ResearchProduct, store?: ResearchCard["store"]) => void; onDeleted: (id: string) => void; cj: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item.title);
  const [stage, setStage] = useState<Stage>(item.stage);
  const [kind, setKind] = useState<ResearchKind>(item.kind);
  const digital = kind === "digital";
  const [notes, setNotes] = useState(item.notes);
  const [image, setImage] = useState(item.image_url ?? "");
  const [price, setPrice] = useState(centsInput(item.target_price));
  const [supplier, setSupplier] = useState(supplierForm(item.supplier));
  const [ads, setAds] = useState<ResearchAd[]>(item.ads);
  const [newAd, setNewAd] = useState({ url: "", startedAt: "" });
  const [slug, setSlug] = useState(slugify(item.title));
  const [cjHits, setCjHits] = useState<CjProduct[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    panel.current?.focus();
    // Escape closes the drawer, unless the delete confirmation is open: then it closes only that.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !confirming) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirming]);

  /** The fields as the server expects them; throws a readable message for bad amounts. */
  function fields() {
    const hasSupplier = supplier.name.trim() || supplier.cost.trim();
    return {
      title, kind, stage, notes, image_url: image.trim() || null, target_price: toCents(price), ads,
      supplier: hasSupplier ? {
        source: supplier.source, id: supplier.id, name: supplier.name.trim() || title, url: supplier.url.trim() || null,
        cost: toCents(supplier.cost) ?? 0, shipping: toCents(supplier.shipping), shippingName: supplier.shippingName.trim() || null, days: supplier.days.trim() || null,
      } : null,
    };
  }
  let preview: ReturnType<typeof unitEconomics> = null;
  try { const draft = fields(); preview = unitEconomics({ kind, target_price: draft.target_price, supplier: draft.supplier as ResearchSupplier | null }); } catch { /* shown when saving */ }

  async function run(key: string, task: () => Promise<void>) {
    setPending(key); setMessage(null);
    try { await task(); } catch (failure) { setMessage({ text: failure instanceof Error ? failure.message : "Something went wrong.", failed: true }); } finally { setPending(null); }
  }
  const save = () => run("save", async () => {
    onSaved((await researchApi<{ item: ResearchProduct }>({ action: "update", id: item.id, ...fields() })).item);
    setMessage({ text: "Saved.", failed: false });
  });
  const findOnCj = () => run("cj", async () => {
    setCjHits((await researchApi<{ products: CjProduct[] }>({ action: "cj-search", query: title.slice(0, 100) })).products.slice(0, 6));
  });
  const pickCj = (product: CjProduct) => run(`cj:${product.id}`, async () => {
    const detail = (await researchApi<{ supplier: CjDetail }>({ action: "cj-detail", pid: product.id })).supplier;
    setSupplier(supplierForm(detail));
    if (!image && (detail.image ?? product.image)) setImage(detail.image ?? product.image ?? "");
    setCjHits(null);
    setMessage({ text: "Supplier costs filled in. Save to keep them.", failed: false });
  });
  const createStore = () => run("store", async () => {
    // Save first, so the store and the idea agree on the name and nothing typed here is lost.
    onSaved((await researchApi<{ item: ResearchProduct }>({ action: "update", id: item.id, ...fields() })).item);
    const { productId } = await researchApi<{ productId: string }>({ action: digital ? "create-digital" : "create-store", id: item.id, slug });
    router.push(digital ? `/admin/products/${productId}` : `/admin/products/${productId}#product`);
  });
  const remove = () => run("delete", async () => {
    try { await researchApi({ action: "delete", id: item.id }); } catch (failure) { setConfirming(false); throw failure; }
    onDeleted(item.id);
  });
  function addAd(event: React.FormEvent) {
    event.preventDefault();
    if (!newAd.url.trim()) return;
    setAds([...ads, { id: crypto.randomUUID(), url: newAd.url.trim(), page: "", startedAt: newAd.startedAt || null, source: "manual", note: "" }]);
    setNewAd({ url: "", startedAt: "" });
  }
  const set = (key: keyof SupplierForm) => (event: React.ChangeEvent<HTMLInputElement>) => setSupplier({ ...supplier, [key]: event.target.value });

  // Rendered at the top of the workspace: the page content animates in with a transform, which would
  // otherwise trap this fixed-position panel inside it. Still inside .admin-shell, so its styles apply.
  const host = document.querySelector(".admin-shell") ?? document.body;
  return createPortal(<div className="research-drawer-wrap">
    <button type="button" className="research-backdrop" aria-label="Close" onClick={onClose} tabIndex={-1} />
    <aside ref={panel} tabIndex={-1} className="research-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <header className="research-drawer-head">
        <div><span className="eyebrow">PRODUCT IDEA</span><h2 id="drawer-title">{title || "Untitled"}</h2></div>
        <button type="button" className="research-icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>

      <div className="research-drawer-body">
        <div className="research-two">
          <label>Product<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label>
          <label>Stage<select value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{STAGES.map((value) => <option key={value} value={value}>{STAGE_LABELS[value]}</option>)}</select></label>
          <label>Kind<select value={kind} onChange={(event) => setKind(event.target.value as ResearchKind)} disabled={!!item.store}><option value="physical">Physical (dropshipped)</option><option value="digital">Digital (download)</option></select></label>
        </div>

        <section className="research-block">
          <h3>The numbers</h3>
          <div className="research-two">
            <label>Your price<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="29.99" /></label>
            {!digital && <>
              <label>Product cost<input inputMode="decimal" value={supplier.cost} onChange={set("cost")} placeholder="4.50" /></label>
              <label>Shipping to US<input inputMode="decimal" value={supplier.shipping} onChange={set("shipping")} placeholder="6.49" /></label>
              <label>Delivery time<input value={supplier.days} onChange={set("days")} maxLength={40} placeholder="7-12 days" /></label>
            </>}
          </div>
          {preview ? <dl className="research-economics">
            <div><dt>Cost delivered</dt><dd>{dollars(preview.landed)}</dd></div>
            <div><dt>Card fees (est.)</dt><dd>{dollars(preview.fees)}</dd></div>
            <div className={preview.profit < 0 ? "bad" : preview.margin >= 0.3 ? "good" : ""}><dt>Profit per sale</dt><dd>{dollars(preview.profit)} <small>{Math.round(preview.margin * 100)}%</small></dd></div>
          </dl> : <p className="field-help">{digital ? "Add your price to see what each sale leaves after card fees." : "Add your price and the product cost to see profit per sale. A healthy dropshipping margin is 30% or more, before ad spend."}</p>}
          {preview && !preview.shippingKnown && <p className="field-help">Shipping isn&apos;t included yet: add it for a true number.</p>}
        </section>

        {!digital && <section className="research-block">
          <div className="research-block-head"><h3>Supplier</h3>
            {cj && <button type="button" className="button secondary small" onClick={findOnCj} disabled={pending === "cj" || title.trim().length < 2}>{pending === "cj" ? <Loader2 className="spin" size={14} /> : <Search size={14} />} Find on CJ</button>}
          </div>
          {cjHits && (cjHits.length === 0 ? <p className="field-help">CJ has nothing under this name. Try renaming the idea to plainer words.</p>
            : <ul className="research-picks">{cjHits.map((hit) => <li key={hit.id}>
              <span>{hit.name}<small>{hit.cost !== null ? `from ${dollars(hit.cost)}` : ""}{hit.listed ? ` · ${hit.listed.toLocaleString("en-US")} stores` : ""}</small></span>
              <button type="button" className="button secondary small" disabled={pending === `cj:${hit.id}`} onClick={() => pickCj(hit)}>{pending === `cj:${hit.id}` ? "…" : "Use"}</button>
            </li>)}</ul>)}
          <div className="research-two">
            <label>Supplier product<input value={supplier.name} onChange={set("name")} maxLength={200} placeholder="Name on the supplier's site" /></label>
            <label>Supplier link<input value={supplier.url} onChange={set("url")} type="url" placeholder="https://…" /></label>
          </div>
          {supplier.shippingName && <p className="field-help">Cheapest CJ shipping: {supplier.shippingName}{supplier.days ? `, ${supplier.days}` : ""}.</p>}
          {supplier.url && <a className="quiet-link" href={supplier.url} target="_blank" rel="noopener noreferrer">Open supplier page <ArrowUpRight size={13} /></a>}
        </section>}

        <section className="research-block">
          <div className="research-block-head"><h3>Proof it sells</h3>
            <a className="quiet-link" href={metaLibraryUrl(title)} target="_blank" rel="noopener noreferrer">US ads on Meta <ArrowUpRight size={13} /></a>
          </div>
          {ads.length === 0 && <p className="field-help">Save ads from the search, or paste links to ads you&apos;ve seen. Ads running 30+ days, with several versions, are the strongest sign.</p>}
          <ul className="research-ads">{ads.map((ad) => {
            const days = daysSince(ad.startedAt);
            return <li key={ad.id}>
              <a href={ad.url} target="_blank" rel="noopener noreferrer">{ad.page || hostname(ad.url)} <ArrowUpRight size={12} /></a>
              <span>{[days !== null ? `${days} days running` : "", ad.note].filter(Boolean).join(" · ")}</span>
              <button type="button" className="research-icon-button" aria-label="Remove this ad" onClick={() => setAds(ads.filter((entry) => entry.id !== ad.id))}><X size={14} /></button>
            </li>;
          })}</ul>
          {ads.length < 20 && <form className="research-add-ad" onSubmit={addAd}>
            <input type="url" value={newAd.url} onChange={(event) => setNewAd({ ...newAd, url: event.target.value })} placeholder="Paste an ad link" aria-label="Ad link" />
            <input type="date" value={newAd.startedAt} onChange={(event) => setNewAd({ ...newAd, startedAt: event.target.value })} aria-label="Started running" title="Started running" />
            <button className="button secondary small" disabled={!newAd.url.trim()}><Plus size={14} /> Add</button>
          </form>}
        </section>

        <section className="research-block">
          <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="Angles, objections in the comments, competitors' prices…" /></label>
          <label>Image link <span className="optional">optional</span><input value={image} onChange={(event) => setImage(event.target.value)} type="url" placeholder="https://…" /></label>
        </section>

        <section className="research-block research-next">
          <h3>Next step</h3>
          {item.store ? <div className="research-store-links">
            <p>This idea has a {item.store.status === "published" ? "live" : "draft"} {item.store.kind === "digital" ? "digital product" : "store"}.</p>
            <Link className="button primary" href={item.store.kind === "digital" ? `/admin/products/${item.store_product_id}` : `/admin/products/${item.store_product_id}#product`}>Open the editor <ArrowRight size={16} /></Link>
            {item.store.kind === "digital"
              ? item.store.status === "published" && <a className="quiet-link" href={`/p/${item.store.slug}`} target="_blank" rel="noopener noreferrer">View the page <ArrowUpRight size={13} /></a>
              : <a className="quiet-link" href={`/s/${item.store.slug}${item.store.status === "published" ? "" : "?preview=1"}`} target="_blank" rel="noopener noreferrer">View the page <ArrowUpRight size={13} /></a>}
          </div> : <>
            <p className="field-help">{digital
              ? "Creates a draft digital product named after this idea, at your price (or $19 if none), and opens it in the editor to add the file and cover. Nothing goes live until you publish."
              : "Creates a draft product store named after this idea and opens it in the editor. Nothing goes live until you publish."}</p>
            <div className="research-store-create">
              <label>{digital ? "Product URL" : "Store URL"}<span className="research-prefix"><span>{digital ? "/p/" : "/s/"}</span><input value={slug} onChange={(event) => setSlug(event.target.value)} maxLength={80} /></span></label>
              <button type="button" className="button primary" onClick={createStore} disabled={!!pending || !slug || !title.trim()}>{pending === "store" ? "Creating…" : <>{digital ? "Create draft" : "Create store"} <ArrowRight size={16} /></>}</button>
            </div>
          </>}
        </section>
      </div>

      <footer className="research-drawer-foot">
        <button ref={deleteRef} type="button" className="research-delete" onClick={() => setConfirming(true)} disabled={!!pending}><Trash2 size={15} /> Delete</button>
        {message && <p role="status" className={message.failed ? "form-error" : "save-success"}>{message.text}</p>}
        <button type="button" className="button primary" onClick={save} disabled={!!pending || !title.trim()}>{pending === "save" ? "Saving…" : "Save changes"}</button>
      </footer>
    </aside>

    <AlertDialog open={confirming} onOpenChange={(next) => { if (pending !== "delete") setConfirming(next); }}>
      <AlertDialogContent className="confirm-dialog research-confirm" initialFocus={keepRef} finalFocus={deleteRef}>
        <div className="confirm-dialog-icon danger" aria-hidden="true"><Trash2 size={22} /></div>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It comes off the board with its ads, supplier details and notes. This can&apos;t be undone.{item.store ? " Its store isn't deleted: it stays under Products." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={keepRef} className="button secondary" disabled={pending === "delete"}>Keep it</AlertDialogCancel>
          <AlertDialogAction type="button" className="button danger" disabled={pending === "delete"} onClick={remove}><Trash2 size={15} />{pending === "delete" ? "Deleting…" : "Delete idea"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>, host);
}

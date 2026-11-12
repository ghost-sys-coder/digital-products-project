"use client";
import { useState } from "react";
import { Lock, Plus, Tag, X } from "lucide-react";
import { describeVariant, MAX_OPTIONS, MAX_VARIANTS, parseMoney, slugify } from "@/lib/store-input";
import { ImagePathField } from "./media";
import { Switch, TextField } from "./fields";
import { blankVariant, regenerateVariants, type Draft, type OptionDraft, type VariantDraft } from "./draft";

type Props = { draft: Draft; update: (update: (draft: Draft) => Draft) => void; published: boolean; savedSlug: string };

function priceProblem(variant: VariantDraft) {
  const price = parseMoney(variant.price);
  if (!variant.price.trim()) return "Add a price.";
  if (Number.isNaN(price) || price < 50) return "Enter a price of at least 0.50, like 49 or 49.99.";
  if (variant.compareAt.trim()) {
    const compare = parseMoney(variant.compareAt);
    if (Number.isNaN(compare) || compare <= price) return "The compare-at price must be higher than the price.";
  }
  if (variant.supplierUrl.trim() && !/^https:\/\/\S+$/i.test(variant.supplierUrl.trim())) return "The supplier link must start with https://.";
  return null;
}

function OptionRow({ option, index, onRename, onAdd, onRemoveValue, onRemove }: {
  option: OptionDraft; index: number; onRename: (name: string) => void; onAdd: (value: string) => void; onRemoveValue: (value: string) => void; onRemove: () => void;
}) {
  const [value, setValue] = useState("");
  const commit = () => {
    const values = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    for (const entry of values) if (entry.length <= 40 && !option.values.some((existing) => existing.toLowerCase() === entry.toLowerCase())) onAdd(entry);
    setValue("");
  };
  return <li className="se-option">
    <div className="se-option-head">
      <input aria-label={`Option ${index + 1} name`} value={option.name} maxLength={30} placeholder={index === 0 ? "Colour" : index === 1 ? "Size" : "Style"} onChange={(event) => onRename(event.target.value)} />
      <button type="button" className="se-icon-button danger" aria-label={`Remove option ${option.name || index + 1}`} onClick={onRemove}><X size={15} aria-hidden /></button>
    </div>
    <div className="se-chips">
      {option.values.map((entry) => <span className="se-chip-value" key={entry}>{entry}<button type="button" aria-label={`Remove ${entry}`} onClick={() => onRemoveValue(entry)}><X size={12} aria-hidden /></button></span>)}
      <input aria-label={`Add a ${option.name || "value"}`} value={value} maxLength={120} placeholder={option.values.length ? "Add another" : "Type a value, then Enter"}
        onChange={(event) => setValue(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); commit(); } else if (event.key === "Backspace" && !value && option.values.length) onRemoveValue(option.values.at(-1)!); }} />
    </div>
  </li>;
}

export function ProductTab({ draft, update, published, savedSlug }: Props) {
  const [bulkPrice, setBulkPrice] = useState("");
  const [slugTouched, setSlugTouched] = useState(draft.slug !== slugify(draft.name));
  const setOptions = (change: (options: OptionDraft[]) => OptionDraft[], regenerate = true) => update((current) => {
    const options = change(current.options);
    return { ...current, options, variants: regenerate ? regenerateVariants(options, current.variants) : current.variants };
  });
  const setVariant = (id: string, patch: Partial<VariantDraft>) => update((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === id ? { ...variant, ...patch } : variant) }));
  const combinations = draft.options.reduce((total, option) => total * Math.max(1, option.values.length), 1);
  const order = draft.options.map((option) => option.name);

  return <>
    <section className="workspace-panel form-panel">
      <div className="form-section-heading"><span className="step-number">01</span><div><h2>The product</h2><p>What it&apos;s called and where it lives.</p></div></div>
      <TextField label="Product name" required max={120} value={draft.name} placeholder="Nebula Galaxy Projector"
        onChange={(name) => update((current) => ({ ...current, name, slug: slugTouched || published ? current.slug : slugify(name) }))} />
      <TextField label="Store URL" required max={80} prefix="/s/" value={draft.slug} placeholder="nebula"
        help={published && draft.slug !== savedSlug ? "Changing the URL of a live store breaks links in ads and posts you've already shared." : "Lowercase letters, numbers and hyphens. Short URLs are easier to share."}
        onChange={(slug) => { setSlugTouched(true); update((current) => ({ ...current, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "") })); }} />
      <TextField label="Tagline" optional max={200} value={draft.tagline} placeholder="Lumora"
        help="A short line above the product name. Also used as the description in search results and link previews." onChange={(tagline) => update((current) => ({ ...current, tagline }))} />
    </section>

    <section className="workspace-panel form-panel">
      <div className="form-section-heading"><span className="step-number">02</span><div><h2>Options</h2><p>Colours, sizes or packs the buyer chooses from. Leave empty for a single version.</p></div></div>
      {draft.options.length > 0 && <ul className="se-options">
        {draft.options.map((option, index) => <OptionRow key={index} option={option} index={index}
          onRename={(name) => update((current) => {
            const previous = current.options[index].name;
            return {
              ...current, options: current.options.map((entry, position) => position === index ? { ...entry, name } : entry),
              variants: current.variants.map((variant) => previous in variant.options
                ? { ...variant, options: Object.fromEntries(Object.entries(variant.options).map(([key, value]) => [key === previous ? name : key, value])) } : variant),
            };
          })}
          onAdd={(value) => setOptions((options) => options.map((entry, position) => position === index ? { ...entry, values: [...entry.values, value] } : entry))}
          onRemoveValue={(value) => setOptions((options) => options.map((entry, position) => position === index ? { ...entry, values: entry.values.filter((existing) => existing !== value) } : entry))}
          onRemove={() => update((current) => {
            const name = current.options[index].name;
            const options = current.options.filter((_, position) => position !== index);
            const seen = new Set<string>();
            // Variants that only differed by this option merge into the first of them.
            const variants = current.variants.map((variant) => ({ ...variant, options: Object.fromEntries(Object.entries(variant.options).filter(([key]) => key !== name)) }))
              .filter((variant) => { const key = JSON.stringify(variant.options); if (seen.has(key)) return false; seen.add(key); return true; });
            return { ...current, options, variants: regenerateVariants(options, variants) };
          })} />)}
      </ul>}
      {draft.options.length < MAX_OPTIONS && <button type="button" className="se-add" onClick={() => setOptions((options) => [...options, { name: "", values: [] }], false)}>
        <Plus size={14} aria-hidden />{draft.options.length ? "Add another option" : "Add options like colour or size"}
      </button>}
      {combinations > MAX_VARIANTS && <p className="form-error" role="alert">That makes {combinations} variants. A store can have at most {MAX_VARIANTS}; remove some values.</p>}
    </section>

    <section className="workspace-panel form-panel">
      <div className="form-section-heading"><span className="step-number">03</span><div><h2>{draft.options.some((option) => option.values.length) ? `Variants (${draft.variants.length})` : "Price and supplier"}</h2><p>What each version costs, and where you order it from.</p></div></div>
      {draft.variants.length > 1 && <div className="se-bulk">
        <TextField label="Set every price" prefix="$" inputMode="decimal" value={bulkPrice} placeholder="49.99" onChange={setBulkPrice} />
        <button type="button" className="button secondary small" disabled={Number.isNaN(parseMoney(bulkPrice))}
          onClick={() => { update((current) => ({ ...current, variants: current.variants.map((variant) => ({ ...variant, price: bulkPrice.trim() })) })); setBulkPrice(""); }}>Apply to all</button>
      </div>}
      {draft.variants.length === 0 ? <div className="se-empty">
        <Tag size={24} aria-hidden /><p>Set a price to start selling. Add options first if the product comes in colours or sizes.</p>
        <button type="button" className="button primary small" onClick={() => update((current) => ({ ...current, variants: [blankVariant()] }))}><Plus size={15} aria-hidden />Set a price</button>
      </div> : <ul className="se-variants">
        {draft.variants.map((variant) => {
          const problem = priceProblem(variant);
          const label = Object.keys(variant.options).length ? describeVariant(variant.options, order) : null;
          return <li key={variant.id} className={`se-variant${variant.active ? "" : " is-off"}`}>
            <div className="se-variant-head">
              <strong className="se-variant-name">{label ?? "Your product"}</strong>
              <Switch label={variant.active ? "For sale" : "Hidden"} checked={variant.active} onChange={(active) => setVariant(variant.id, { active })} />
            </div>
            <ImagePathField label="Image" value={variant.image} onChange={(image) => setVariant(variant.id, { image })}
              help={label ? "Shown when a buyer picks this option, and at checkout." : "Shown at checkout and in order emails."} />
            <div className="se-grid-3">
              <TextField label="Price" required prefix="$" inputMode="decimal" value={variant.price} placeholder="49.99" invalid={!!problem && /price/i.test(problem) && !/compare/i.test(problem)} onChange={(price) => setVariant(variant.id, { price })} />
              <TextField label="Compare-at price" optional prefix="$" inputMode="decimal" value={variant.compareAt} placeholder="69.99" onChange={(compareAt) => setVariant(variant.id, { compareAt })} />
              <TextField label="SKU" optional max={80} value={variant.sku} onChange={(sku) => setVariant(variant.id, { sku })} />
            </div>
            <div className="se-private">
              <span className="se-private-label"><Lock size={12} aria-hidden />Private · never shown to customers</span>
              <div className="se-grid-2">
                <TextField label="Supplier link" type="url" value={variant.supplierUrl} placeholder="https://www.aliexpress.com/item/…" onChange={(supplierUrl) => setVariant(variant.id, { supplierUrl })} />
                <TextField label="Supplier SKU or option" optional max={120} value={variant.supplierSku} placeholder="Black, US plug" onChange={(supplierSku) => setVariant(variant.id, { supplierSku })} />
              </div>
            </div>
            {problem && <p className="se-inline-error" role="alert">{problem}</p>}
          </li>;
        })}
      </ul>}
      <p className="field-help">Only use a compare-at price you genuinely sold at recently; the store labels it as an earlier price. Hidden variants can&apos;t be bought.</p>
    </section>
  </>;
}

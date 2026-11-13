"use client";
import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Package, Plus, Search, X } from "lucide-react";
import type { RelatedChoice } from "@/lib/related-products";
import { MAX_RELATED } from "@/lib/product-input";

/**
 * Picks up to four other digital products to suggest under this one's page, in display order.
 * Submits them as one "related" field of comma-separated ids (lib/product-input.ts). Styles: app/admin-ui.css.
 */
export function RelatedPicker({ choices, initial, disabled = false }: { choices: RelatedChoice[]; initial: string[]; disabled?: boolean }) {
  const byId = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);
  const [selected, setSelected] = useState(() => initial.filter((id) => byId.has(id)).slice(0, MAX_RELATED));
  const [query, setQuery] = useState("");
  const full = selected.length >= MAX_RELATED;
  const needle = query.trim().toLowerCase();
  const available = choices.filter((choice) => !selected.includes(choice.id) && (!needle || choice.name.toLowerCase().includes(needle)));

  function move(index: number, by: -1 | 1) {
    setSelected((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  return <div className="related-picker">
    <input type="hidden" name="related" value={selected.join(",")} />
    {selected.length ? <ol className="related-list" aria-label="Shown on the product page">
      {selected.map((id, index) => {
        const choice = byId.get(id)!;
        return <li key={id} className="related-item is-chosen">
          <span className="related-order" aria-hidden="true">{index + 1}</span>
          <Thumb choice={choice} />
          <Details choice={choice} />
          <span className="related-tools">
            <button type="button" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label={`Move ${choice.name} up`}><ArrowUp size={15} /></button>
            <button type="button" onClick={() => move(index, 1)} disabled={disabled || index === selected.length - 1} aria-label={`Move ${choice.name} down`}><ArrowDown size={15} /></button>
            <button type="button" onClick={() => setSelected((current) => current.filter((entry) => entry !== id))} disabled={disabled} aria-label={`Remove ${choice.name}`}><X size={15} /></button>
          </span>
        </li>;
      })}
    </ol> : <p className="related-empty">Nothing suggested yet, so the page shows this product alone.</p>}

    {choices.length ? <>
      <div className="related-add-head"><span>Add a product</span><span className="related-count">{selected.length} of {MAX_RELATED}</span></div>
      {choices.length > 6 && <div className="related-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a product" aria-label="Find a product to suggest"
          // Enter here would otherwise submit the whole product form.
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
      </div>}
      {available.length ? <ul className="related-list">
        {available.map((choice) => <li key={choice.id}>
          <button type="button" className="related-item related-option" onClick={() => { setSelected((current) => [...current, choice.id]); setQuery(""); }} disabled={disabled || full}>
            <Thumb choice={choice} />
            <Details choice={choice} />
            <span className="related-plus" aria-hidden="true"><Plus size={16} /></span>
            <span className="sr-only">Suggest {choice.name}</span>
          </button>
        </li>)}
      </ul> : <p className="related-empty">{needle ? `No other product matches “${query.trim()}”.` : "Every other product is already suggested."}</p>}
      {full && available.length > 0 && <p className="field-help">A page shows up to {MAX_RELATED}. Remove one to make room for another.</p>}
    </> : <p className="related-empty">Add another digital product and you can suggest it here.</p>}
  </div>;
}

function Thumb({ choice }: { choice: RelatedChoice }) {
  return <span className="related-thumb">
    {choice.cover ? <Image src={choice.cover} alt="" width={88} height={88} unoptimized /> : <Package size={18} aria-hidden="true" />}
  </span>;
}

function Details({ choice }: { choice: RelatedChoice }) {
  return <span className="related-details">
    <strong>{choice.name}</strong>
    <span>{choice.published ? choice.price ?? "Price not set" : "Draft · appears once it’s published"}</span>
  </span>;
}

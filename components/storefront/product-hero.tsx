"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Play, Plus, Truck } from "lucide-react";
import { isAnimatedImage, type Media } from "@/lib/store-page";
import type { PublicOption, PublicShipping, PublicVariant } from "@/lib/storefront";
import { StoreIcon, badgeIcon } from "./icons";
import { StoreVideo } from "./store-video";

type Props = {
  productId: string; name: string; headline: string; subheadline: string; tagline: string;
  currency: string; media: Media[]; highlights: string[]; badges: string[];
  variants: PublicVariant[]; options: PublicOption[]; shipping: PublicShipping[];
  mediaBase: string; draft: boolean;
};

const COLOR_WORDS: Record<string, string> = {
  black: "#111111", white: "#f7f7f7", grey: "#9a9a9a", gray: "#9a9a9a", silver: "#c9ccd1", red: "#d93a3a",
  pink: "#f4a7c0", rose: "#e8a2a8", blue: "#3466d6", navy: "#1d2a4d", green: "#3e9a5a", sage: "#a3b18a",
  yellow: "#f3cf3a", orange: "#f08a2c", purple: "#7e57c2", lilac: "#c6b2e3", beige: "#dccbb0", cream: "#f3ead7",
  brown: "#7a5134", gold: "#d4af37", nude: "#e3bfa3", teal: "#2a9d8f", mint: "#a8e6cf",
};
/** A swatch colour for a colour name, or null to show a text chip instead. */
function swatch(value: string) {
  const words = value.toLowerCase().split(/[\s/-]+/);
  for (const word of words.reverse()) if (COLOR_WORDS[word]) return COLOR_WORDS[word];
  return null;
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}

function addBusinessDays(from: Date, days: number) {
  const date = new Date(from);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  return date;
}

export function ProductHero(props: Props) {
  const { variants, options, currency, shipping } = props;
  const [selected, setSelected] = useState<Record<string, string>>(() => variants[0]?.options ?? {});
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState("");
  const [barVisible, setBarVisible] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);
  // One reservation per selection: retries reuse it, a new variant or quantity starts a new one.
  const reservation = useRef<{ key: string; id: string } | null>(null);

  const variant = useMemo(
    () => variants.find((item) => options.every((option) => item.options[option.name] === selected[option.name])) ?? null,
    [variants, options, selected],
  );

  // Gallery: hero media first, then any variant photo that is not already shown.
  const slides = useMemo(() => {
    const list: Media[] = [...props.media];
    for (const item of variants) {
      if (item.image && !list.some((entry) => entry.path === item.image)) list.push({ path: item.image, kind: "image", alt: `${props.name} – ${item.label}`, poster: null });
    }
    return list;
  }, [props.media, props.name, variants]);
  const [slide, setSlide] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track || !slides.length) return;
    const next = (index + slides.length) % slides.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    setSlide(next);
  }

  function choose(name: string, value: string) {
    const next = { ...selected, [name]: value };
    // If that combination does not exist, keep the new choice and pick the closest variant that has it.
    const exact = variants.find((item) => options.every((option) => item.options[option.name] === next[option.name]));
    const fallback = exact ?? variants.find((item) => item.options[name] === value);
    const resolved = fallback ? { ...fallback.options } : next;
    setSelected(resolved);
    const image = (exact ?? fallback)?.image;
    if (image) {
      const index = slides.findIndex((entry) => entry.path === image);
      if (index >= 0) goTo(index);
    }
  }

  function available(name: string, value: string) {
    return variants.some((item) => item.options[name] === value && options.every((option) => option.name === name || item.options[option.name] === selected[option.name]));
  }

  useEffect(() => {
    const cheapest = [...shipping].sort((a, b) => a.amount - b.amount)[0];
    if (!cheapest) return;
    const format = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
    const now = new Date();
    // Computed on the device so the dates use the shopper's own calendar and time zone.
    const id = requestAnimationFrame(() => setDelivery(`${format.format(addBusinessDays(now, cheapest.minDays))} – ${format.format(addBusinessDays(now, cheapest.maxDays))}`));
    return () => cancelAnimationFrame(id);
  }, [shipping]);

  useEffect(() => {
    const node = buyRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  async function buy() {
    if (!variant || pending) return;
    setPending(true);
    setError("");
    const key = `${variant.id}:${quantity}`;
    if (reservation.current?.key !== key) reservation.current = { key, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/checkout/physical", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: props.productId, variantId: variant.id, quantity, checkoutId: reservation.current.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) reservation.current = null;
      if (!response.ok || typeof body.url !== "string") throw new Error(body.error || "Checkout is unavailable right now. Please try again.");
      window.location.assign(body.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout is unavailable right now.");
      setPending(false);
    }
  }

  const price = variant?.price ?? Math.min(...variants.map((item) => item.price));
  const compareAt = variant?.compareAt ?? null;
  const saving = compareAt ? Math.round((1 - price / compareAt) * 100) : 0;
  const freeShipping = shipping.some((rate) => rate.amount === 0);
  const cheapestShipping = [...shipping].sort((a, b) => a.amount - b.amount)[0];
  const thumb = variant?.image ?? slides.find((entry) => entry.kind === "image")?.path;
  const cta = pending ? "Opening secure checkout…" : !variant ? "Unavailable" : props.draft ? "Buy now (test)" : "Buy now";

  return (
    <section className="st-hero" id="buy" aria-label={props.name}>
      <div className="st-shell st-hero-grid">
        <div className="st-gallery">
          <div className="st-gallery-main">
            <div className="st-gallery-track" ref={trackRef} onScroll={(event) => {
              const track = event.currentTarget;
              const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
              if (index !== slide) setSlide(index);
            }}>
              {slides.map((entry, index) => (
                <div className="st-gallery-slide" key={entry.path} aria-hidden={index !== slide}>
                  {entry.kind === "video"
                    ? <StoreVideo src={props.mediaBase + entry.path} poster={entry.poster && props.mediaBase + entry.poster} label={entry.alt || props.name} active={index === slide} sound />
                    : <Image src={props.mediaBase + entry.path} alt={entry.alt || props.name} fill sizes="(max-width: 960px) 100vw, 52vw" preload={index === 0} loading={index === 0 ? "eager" : "lazy"} unoptimized={isAnimatedImage(entry.path)} />}
                </div>
              ))}
            </div>
            {saving > 0 && <span className="st-sale-pill">Save {saving}%</span>}
            {slides.length > 1 && <>
              <button type="button" className="st-gallery-arrow prev" onClick={() => goTo(slide - 1)} aria-label="Previous image"><ChevronLeft size={20} /></button>
              <button type="button" className="st-gallery-arrow next" onClick={() => goTo(slide + 1)} aria-label="Next image"><ChevronRight size={20} /></button>
              <span className="st-gallery-count" aria-live="polite">{slide + 1} / {slides.length}</span>
            </>}
          </div>
          {slides.length > 1 && (
            <div className="st-thumbs" role="tablist" aria-label="Product images">
              {slides.map((entry, index) => (
                <button type="button" role="tab" aria-selected={index === slide} key={entry.path} className="st-thumb" onClick={() => goTo(index)} aria-label={entry.kind === "video" ? `Play video ${index + 1}` : `Show image ${index + 1}`}>
                  {entry.kind === "video"
                    ? <>{entry.poster && <Image src={props.mediaBase + entry.poster} alt="" fill sizes="80px" />}<span className="st-thumb-video"><Play size={14} fill="currentColor" aria-hidden /></span></>
                    : <Image src={props.mediaBase + entry.path} alt="" fill sizes="80px" unoptimized={isAnimatedImage(entry.path)} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="st-buybox" ref={buyRef}>
          {props.tagline && <p className="st-eyebrow">{props.tagline}</p>}
          <h1 className="st-title">{props.name}</h1>
          {props.headline && <p className="st-hero-headline">{props.headline}</p>}
          <div className="st-price-row">
            <span className="st-price">{variant ? "" : "From "}{money(price, currency)}</span>
            {compareAt && <span className="st-compare"><span className="sr-only">Previously </span><s>{money(compareAt, currency)}</s></span>}
            {saving > 0 && <span className="st-save">You save {money(compareAt! - price, currency)}</span>}
          </div>
          {props.subheadline && <p className="st-sub">{props.subheadline}</p>}
          {props.highlights.length > 0 && (
            <ul className="st-highlights">{props.highlights.map((item) => <li key={item}><StoreIcon name="check" size={18} />{item}</li>)}</ul>
          )}

          {options.map((option) => {
            const colour = /^colou?r$/i.test(option.name);
            return (
              <fieldset className="st-option" key={option.name}>
                <legend>{option.name}: <strong>{selected[option.name]}</strong></legend>
                <div className={colour ? "st-swatches" : "st-chips"}>
                  {option.values.map((value) => {
                    const fill = colour ? swatch(value) : null;
                    const active = selected[option.name] === value;
                    const open = available(option.name, value);
                    return (
                      <button type="button" key={value} aria-pressed={active} data-unavailable={!open || undefined}
                        className={fill ? "st-swatch" : "st-chip"} onClick={() => choose(option.name, value)}
                        aria-label={fill ? `${option.name} ${value}` : undefined} title={fill ? value : undefined}>
                        {fill ? <span style={{ background: fill }} /> : value}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div className="st-buy-row">
            <div className="st-qty" role="group" aria-label="Quantity">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Decrease quantity"><Minus size={16} /></button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" onClick={() => setQuantity((value) => Math.min(10, value + 1))} disabled={quantity >= 10} aria-label="Increase quantity"><Plus size={16} /></button>
            </div>
            <button type="button" className="st-button st-buy" onClick={buy} disabled={!variant || pending}>{cta}</button>
          </div>
          {error && <p className="st-error" role="alert">{error}</p>}

          {cheapestShipping && (
            <div className="st-delivery">
              <Truck size={20} strokeWidth={1.75} aria-hidden />
              <div>
                <strong>{freeShipping ? "Free shipping" : `Shipping from ${money(cheapestShipping.amount, currency)}`} to the US</strong>
                <span>{delivery ? `Estimated delivery ${delivery}` : `Usually arrives in ${cheapestShipping.minDays}–${cheapestShipping.maxDays} business days`}</span>
              </div>
            </div>
          )}

          {props.badges.length > 0 && (
            <ul className="st-badges">{props.badges.map((badge) => <li key={badge}><StoreIcon name={badgeIcon(badge)} size={18} />{badge}</li>)}</ul>
          )}
        </div>
      </div>

      <div className={`st-sticky-bar${barVisible ? " visible" : ""}`} aria-hidden={!barVisible}>
        <div className="st-shell st-sticky-inner">
          {thumb && <span className="st-sticky-thumb"><Image src={props.mediaBase + thumb} alt="" fill sizes="48px" unoptimized={isAnimatedImage(thumb)} /></span>}
          <span className="st-sticky-text"><strong>{props.name}</strong><span>{variant?.label ? `${variant.label} · ` : ""}{money(price, currency)}</span></span>
          <button type="button" className="st-button" onClick={buy} disabled={!variant || pending} tabIndex={barVisible ? 0 : -1}>{cta}</button>
        </div>
      </div>
    </section>
  );
}

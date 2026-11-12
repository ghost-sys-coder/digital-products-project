import Image from "next/image";
import { Check, Minus, ShieldCheck } from "lucide-react";
import { isAnimatedImage, type Media, type Section } from "@/lib/store-page";
import type { PublicShipping } from "@/lib/storefront";
import { StoreIcon } from "./icons";
import { StoreVideo } from "./store-video";

// Server-rendered marketing sections. Every value here has already been through parseStorePage,
// and is rendered as text: nothing on a store page is ever interpreted as HTML.

type Context = { mediaBase: string; productName: string; currency: string; shipping: PublicShipping[]; priceLabel: string };

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}

/** An image (GIFs are served as-is: Next.js doesn't re-encode animation) or a store video. */
function Visual({ media, ctx, sizes, className, sound = false }: { media: Media; ctx: Context; sizes: string; className?: string; sound?: boolean }) {
  if (media.kind === "video") {
    return <StoreVideo className={className} src={ctx.mediaBase + media.path} poster={media.poster && ctx.mediaBase + media.poster} label={media.alt || ctx.productName} sound={sound} />;
  }
  return <Image className={className} src={ctx.mediaBase + media.path} alt={media.alt} fill sizes={sizes} unoptimized={isAnimatedImage(media.path)} />;
}

function Heading({ children, eyebrow, center = false }: { children: React.ReactNode; eyebrow?: string; center?: boolean }) {
  if (!children) return null;
  return <header className={`st-heading${center ? " center" : ""}`}>{eyebrow && <p className="st-eyebrow">{eyebrow}</p>}<h2>{children}</h2></header>;
}

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>;
}

function BuyLink({ label }: { label: string }) {
  return <a className="st-button" href="#buy">{label}</a>;
}

export function StoreSection({ section, ctx }: { section: Section; ctx: Context }) {
  switch (section.type) {
    case "showcase": {
      const { data } = section;
      return (
        <section className={`st-section st-showcase layout-${data.layout} tone-${data.tone}`} id={section.id}>
          {data.watermark && <span className="st-watermark" aria-hidden>{data.watermark}</span>}
          <div className="st-shell st-showcase-grid">
            <div className="st-showcase-copy">
              {data.eyebrow && <p className="st-eyebrow">{data.eyebrow}</p>}
              <h2 className="st-display">{data.headline}</h2>
              {data.text && <p className="st-lede">{data.text}</p>}
              {data.buttonLabel && <BuyLink label={data.buttonLabel} />}
            </div>
            {data.media && (
              <div className="st-showcase-visual">
                <span className="st-blob" aria-hidden />
                <div className="st-showcase-image"><Visual media={data.media} ctx={ctx} sizes="(max-width: 960px) 90vw, 46vw" /></div>
              </div>
            )}
          </div>
        </section>
      );
    }
    case "benefits": {
      const { data } = section;
      if (!data.items.length) return null;
      if (data.layout === "spotlight" && data.media) {
        const half = Math.ceil(data.items.length / 2);
        const column = (items: typeof data.items, side: "left" | "right") => (
          <ul className={`st-spot-list ${side}`}>
            {items.map((item) => <li key={item.title}><span className="st-icon"><StoreIcon name={item.icon} /></span><div><h3>{item.title}</h3>{item.text && <p>{item.text}</p>}</div></li>)}
          </ul>
        );
        return (
          <section className="st-section st-benefits spotlight" id={section.id}>
            <div className="st-shell">
              <Heading center>{data.title}</Heading>
              <div className="st-spot-grid">
                {column(data.items.slice(0, half), "left")}
                <div className="st-spot-visual"><span className="st-spot-ring" aria-hidden /><div className="st-spot-image"><Visual media={data.media} ctx={ctx} sizes="(max-width: 960px) 70vw, 30vw" /></div></div>
                {column(data.items.slice(half), "right")}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section className="st-section st-benefits" id={section.id}>
          <div className="st-shell">
            <Heading center>{data.title}</Heading>
            <ul className="st-benefit-grid">
              {data.items.map((item) => <li key={item.title}><span className="st-icon"><StoreIcon name={item.icon} /></span><h3>{item.title}</h3>{item.text && <p>{item.text}</p>}</li>)}
            </ul>
          </div>
        </section>
      );
    }
    case "features": {
      const { data } = section;
      if (!data.items.length) return null;
      return (
        <section className="st-section st-features" id={section.id}>
          <div className="st-shell st-feature-list">
            {data.items.map((item, index) => (
              <article className={`st-feature${index % 2 ? " flip" : ""}${item.media ? "" : " text-only"}`} key={`${item.title}-${index}`}>
                {item.media && <div className="st-feature-visual"><Visual media={item.media} ctx={ctx} sizes="(max-width: 960px) 100vw, 50vw" sound /></div>}
                <div className="st-feature-copy">
                  {item.eyebrow && <p className="st-eyebrow">{item.eyebrow}</p>}
                  <h2>{item.title}</h2>
                  <span className="st-rule" aria-hidden />
                  {item.text && <Paragraphs text={item.text} />}
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }
    case "image_banner": {
      const { data } = section;
      if (!data.media) return null;
      return (
        <section className="st-section st-banner" id={section.id}>
          <div className="st-shell">
            <div className="st-banner-frame">
              <Visual media={data.media} ctx={ctx} sizes="(max-width: 1280px) 100vw, 1240px" className="st-banner-media" />
              {(data.headline || data.text || data.buttonLabel) && (
                <div className="st-banner-copy">
                  {data.headline && <h2 className="st-display">{data.headline}</h2>}
                  {data.text && <p>{data.text}</p>}
                  {data.buttonLabel && <BuyLink label={data.buttonLabel} />}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }
    case "bento": {
      const { data } = section;
      if (!data.tiles.length) return null;
      const sizes = data.layout === "masonry"
        ? "(max-width: 960px) 50vw, 33vw"
        : { small: "(max-width: 960px) 50vw, 25vw", wide: "(max-width: 960px) 100vw, 50vw", tall: "(max-width: 960px) 50vw, 25vw", large: "(max-width: 960px) 100vw, 50vw" };
      return (
        <section className={`st-section st-bento-section layout-${data.layout}`} id={section.id}>
          <div className="st-shell">
            <Heading center eyebrow={data.eyebrow}>{data.title}</Heading>
            <ul className={data.layout === "masonry" ? "st-masonry" : "st-bento"}>
              {data.tiles.map((tile, index) => (
                <li key={`${tile.title}-${index}`} className={`st-tile size-${tile.size} tone-${tile.tone}${tile.media ? " has-media" : ""}`}>
                  {tile.media && <Visual media={tile.media} ctx={ctx} sizes={typeof sizes === "string" ? sizes : sizes[tile.size]} className="st-tile-media" />}
                  {(tile.icon || tile.title || tile.text) && (
                    <div className="st-tile-copy">
                      {tile.icon && !tile.media && <span className="st-icon"><StoreIcon name={tile.icon} /></span>}
                      {tile.title && <h3>{tile.title}</h3>}
                      {tile.text && <p>{tile.text}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    }
    case "statement": {
      const { data } = section;
      return (
        <section className={`st-section st-statement tone-${data.tone}`} id={section.id}>
          <figure className="st-shell narrow">
            <blockquote><p>{data.quote}</p></blockquote>
            {data.attribution && <figcaption>{data.attribution}</figcaption>}
          </figure>
        </section>
      );
    }
    case "video_strip": {
      const { data } = section;
      if (!data.videos.length) return null;
      return (
        <section className="st-section st-videos" id={section.id}>
          <div className="st-shell"><Heading center>{data.title}</Heading></div>
          <div className="st-video-row">
            {data.videos.map((video) => (
              <figure className="st-video" key={video.media.path}>
                <StoreVideo src={ctx.mediaBase + video.media.path} poster={video.media.poster && ctx.mediaBase + video.media.poster} label={video.media.alt || video.caption || ctx.productName} sound />
                {video.caption && <figcaption>{video.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      );
    }
    case "how_it_works": {
      const { data } = section;
      if (!data.steps.length) return null;
      return (
        <section className="st-section st-steps" id={section.id}>
          <div className="st-shell">
            <Heading center>{data.title}</Heading>
            <ol className="st-step-list">
              {data.steps.map((step, index) => <li key={`${step.title}-${index}`}><span className="st-step-number">{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3>{step.text && <p>{step.text}</p>}</li>)}
            </ol>
          </div>
        </section>
      );
    }
    case "comparison": {
      const { data } = section;
      if (!data.rows.length) return null;
      const mark = (value: boolean, label: string) => value
        ? <span className="st-yes"><Check size={18} aria-hidden /><span className="sr-only">{label}: yes</span></span>
        : <span className="st-no"><Minus size={18} aria-hidden /><span className="sr-only">{label}: no</span></span>;
      return (
        <section className="st-section st-compare-section" id={section.id}>
          <div className="st-shell narrow">
            <Heading center>{data.title}</Heading>
            <div className="st-table-wrap">
              <table className="st-compare-table">
                <thead><tr><th scope="col"><span className="sr-only">Feature</span></th><th scope="col" className="ours">{data.ourLabel}</th><th scope="col">{data.theirLabel}</th></tr></thead>
                <tbody>{data.rows.map((row) => <tr key={row.feature}><th scope="row">{row.feature}</th><td className="ours">{mark(row.ours, data.ourLabel)}</td><td>{mark(row.theirs, data.theirLabel)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }
    case "size_guide": {
      const { data } = section;
      if (!data.rows.length) return null;
      return (
        <section className="st-section st-size" id={section.id}>
          <div className="st-shell narrow">
            <Heading center>{data.title || "Size guide"}</Heading>
            <div className="st-table-wrap">
              <table className="st-data-table">
                <thead><tr>{data.columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
                <tbody>{data.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {data.note && <p className="st-note">{data.note}</p>}
          </div>
        </section>
      );
    }
    case "specs": {
      const { data } = section;
      if (!data.rows.length) return null;
      return (
        <section className="st-section st-specs" id={section.id}>
          <div className="st-shell narrow">
            <Heading center>{data.title}</Heading>
            <dl className="st-spec-list">{data.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
          </div>
        </section>
      );
    }
    case "guarantee": {
      const { data } = section;
      return (
        <section className="st-section st-guarantee" id={section.id}>
          <div className="st-shell narrow">
            <div className="st-guarantee-card">
              <span className="st-icon large"><ShieldCheck size={30} strokeWidth={1.6} aria-hidden /></span>
              <h2>{data.title}</h2>
              {data.text && <Paragraphs text={data.text} />}
              {ctx.shipping.length > 0 && (
                <ul className="st-rates">
                  {ctx.shipping.map((rate) => <li key={rate.name}><span>{rate.name}</span><span>{rate.minDays}–{rate.maxDays} business days</span><strong>{rate.amount === 0 ? "Free" : money(rate.amount, ctx.currency)}</strong></li>)}
                </ul>
              )}
            </div>
          </div>
        </section>
      );
    }
    case "faq": {
      const { data } = section;
      if (!data.items.length) return null;
      return (
        <section className="st-section st-faq" id={section.id}>
          <div className="st-shell narrow">
            <Heading center>{data.title}</Heading>
            <div className="st-faq-list">
              {data.items.map((item) => <details key={item.question}><summary>{item.question}<span className="st-faq-mark" aria-hidden /></summary><div className="st-faq-answer"><Paragraphs text={item.answer} /></div></details>)}
            </div>
          </div>
        </section>
      );
    }
    case "final_cta": {
      const { data } = section;
      return (
        <section className="st-section st-final" id={section.id}>
          <div className="st-shell">
            <div className="st-final-card">
              <h2 className="st-display">{data.headline}</h2>
              {data.text && <p>{data.text}</p>}
              <a className="st-button" href="#buy">Get yours · {ctx.priceLabel}</a>
            </div>
          </div>
        </section>
      );
    }
    // Verified reviews arrive in Phase 2; until then the section renders nothing rather than placeholders.
    case "reviews":
    // The hero and announcement bar are placed by the page itself.
    case "hero":
    case "announcement":
      return null;
  }
}

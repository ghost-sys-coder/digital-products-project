import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getStore, listProducts } from "@/lib/catalog";
import type { Store } from "@/lib/catalog.types";
import { LEGAL_KINDS, LEGAL_TITLES, LEGAL_UPDATED, legalDocument, type LegalKind } from "@/lib/site-legal";
import { monaSans } from "@/app/studio-fonts";
import { SiteFooter, SiteHeader, SUPPORT_FALLBACK } from "./chrome";

// One layout for /privacy, /terms, /refunds and /data-deletion. Styles: app/studio.css (.vc-legal).

const FALLBACK_STORE: Store = { id: "", owner_user_id: null, name: "VeilCode Studio", tagline: "", bio: "", support_email: SUPPORT_FALLBACK, website_url: null };
const dateFormat =new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export function legalMetadata(kind: LegalKind): Metadata {
  return { title: LEGAL_TITLES[kind], description: legalDocument(kind, SUPPORT_FALLBACK).intro };
}

export async function LegalPage({ kind }: { kind: LegalKind }) {
  // These pages must load even if the database doesn't (Meta and Stripe check them), so both reads fall back.
  const [store, products] = await Promise.all([getStore().catch(() => null), listProducts(true, "digital").catch(() => [])]);
  const support = store?.support_email || SUPPORT_FALLBACK;
  const doc = legalDocument(kind, support);
  return (
    <div className={`vc ${monaSans.variable}`}>
      <SiteHeader base="/" cta={false} />
      <main className="vc-wrap vc-legal">
        <Link className="vc-back" href="/"><ArrowLeft size={16} aria-hidden="true" /> VeilCode Studio</Link>
        <div className="vc-legal-grid">
          <nav className="vc-legal-nav" aria-label="Legal">
            {LEGAL_KINDS.map((other) => (
              <Link key={other} href={`/${other}`} aria-current={other === kind ? "page" : undefined}>{LEGAL_TITLES[other]}</Link>
            ))}
          </nav>
          <article className="vc-legal-doc">
            <p className="vc-eyebrow">Last updated {dateFormat.format(new Date(LEGAL_UPDATED))}</p>
            <h1 className="vc-heading">{doc.title}</h1>
            <p className="vc-legal-intro">{doc.intro}</p>
            {doc.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter store={store ?? FALLBACK_STORE} products={products} support={support} base="/" />
    </div>
  );
}

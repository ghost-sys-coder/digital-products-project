import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getStorefront, type Storefront } from "@/lib/storefront";
import { buildPolicy, POLICY_KINDS, POLICY_TITLES, type PolicyKind } from "@/lib/store-policies";
import { StoreFrame } from "@/components/storefront/store-frame";
import "../../storefront.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; policy: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// The owner can read a draft store's policies with ?preview=1, like the store page itself.
const loadStore = cache((slug: string, preview: boolean) => getStorefront(slug, { preview }));

function documentFor(store: Storefront, kind: PolicyKind) {
  return buildPolicy(kind, {
    brand: store.brand.name, productName: store.product.name, supportEmail: store.brand.supportEmail,
    currency: store.product.currency, rates: store.shipping, policies: store.policies!,
  });
}
async function load({ params, searchParams }: Params) {
  const [{ slug, policy }, query] = await Promise.all([params, searchParams]);
  if (!(POLICY_KINDS as readonly string[]).includes(policy)) return null;
  const store = await loadStore(slug, query.preview === "1");
  if (!store?.policies) return null;
  return { store, kind: policy as PolicyKind };
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const found = await load(props);
  if (!found) return { title: "Page not found" };
  const doc = documentFor(found.store, found.kind);
  return {
    title: { absolute: `${doc.title} | ${found.store.brand.name}` }, description: doc.intro,
    ...(found.store.product.draft ? { robots: { index: false, follow: false } } : {}),
  };
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function PolicyPage(props: Params) {
  const found = await load(props);
  if (!found) notFound();
  const { store, kind } = found;
  const doc = documentFor(store, kind);
  return (
    <StoreFrame store={store}>
      <main className="st-section st-policy">
        <article className="st-shell narrow">
          <p className="st-eyebrow">{store.brand.name}</p>
          <h1>{doc.title}</h1>
          <p className="st-lede">{doc.intro}</p>
          <p className="st-policy-updated">Last updated {dateFormat.format(new Date(doc.updatedAt))}</p>
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {section.table && section.table.length > 1 && (
                <div className="st-table-wrap">
                  <table className="st-data-table">
                    <thead><tr>{section.table[0].map((cell) => <th scope="col" key={cell}>{cell}</th>)}</tr></thead>
                    <tbody>{section.table.slice(1).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
          <nav className="st-policy-nav" aria-label="Other policies">
            {POLICY_KINDS.filter((other) => other !== kind).map((other) => <a key={other} href={`/s/${store.product.slug}/policies/${other}${store.product.draft ? "?preview=1" : ""}`}>{POLICY_TITLES[other]}</a>)}
          </nav>
        </article>
      </main>
    </StoreFrame>
  );
}

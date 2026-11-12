import Image from "next/image";
import { Lock } from "lucide-react";
import type { Storefront } from "@/lib/storefront";
import { POLICY_KINDS, POLICY_TITLES } from "@/lib/store-policies";
import { themeVariables, THEME_TOKENS } from "@/lib/store-themes";
import { storeFontVariables } from "@/app/s/[slug]/fonts";

type NavItem = { href: string; label: string };

/**
 * The themed shell shared by a store's page, its policies and its order confirmation: brand header,
 * optional section links, and a footer that always links every policy page.
 */
export function StoreFrame({ store, children, nav = [], announcement, onStorePage = false }: {
  store: Storefront; children: React.ReactNode; nav?: NavItem[]; announcement?: string; onStorePage?: boolean;
}) {
  // A draft is only visible in the owner's preview; keep its links in preview too.
  const query = store.product.draft ? "?preview=1" : "";
  const home = `/s/${store.product.slug}${query}`;
  const policyBase = `/s/${store.product.slug}/policies`;
  return (
    <div className={`st ${storeFontVariables}`} data-theme={store.theme} data-dark={THEME_TOKENS[store.theme].dark || undefined} style={themeVariables(store.theme, store.brand) as React.CSSProperties}>
      {store.product.draft && <p className="st-draft" role="note">Draft preview · only you can see this page</p>}
      {announcement && <p className="st-announcement">{announcement}</p>}
      <header className="st-header">
        <div className="st-shell st-header-inner">
          <a className="st-logo" href={onStorePage ? "#top" : home} aria-label={`${store.brand.name} home`}>
            {store.brand.logo
              ? <Image src={store.mediaBase + store.brand.logo} alt={store.brand.name} width={160} height={40} preload={onStorePage} />
              : <span>{store.brand.name}</span>}
          </a>
          {nav.length > 0 && <nav className="st-nav" aria-label="Page sections">{nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>}
          <a className="st-button small" href={onStorePage ? "#buy" : `${home}#buy`}>Shop now</a>
        </div>
      </header>
      {children}
      <footer className="st-footer">
        <div className="st-shell st-footer-inner">
          <div>
            <p className="st-footer-brand">{store.brand.name}</p>
            {store.brand.supportEmail && <p>Questions? <a href={`mailto:${store.brand.supportEmail}`}>{store.brand.supportEmail}</a></p>}
          </div>
          <p className="st-footer-secure"><Lock size={15} aria-hidden /> Secure checkout powered by Stripe</p>
          <p className="st-footer-copy">© {new Date().getFullYear()} {store.brand.name}</p>
        </div>
        {store.policies && (
          <nav className="st-shell st-footer-policies" aria-label="Store policies">
            {POLICY_KINDS.map((kind) => <a key={kind} href={`${policyBase}/${kind}${query}`}>{POLICY_TITLES[kind]}</a>)}
          </nav>
        )}
      </footer>
    </div>
  );
}

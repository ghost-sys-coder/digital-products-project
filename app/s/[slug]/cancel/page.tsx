import type { Metadata } from "next";
import { getStorefront } from "@/lib/storefront";
import { StoreFrame } from "@/components/storefront/store-frame";
import { CancelOrder } from "@/components/storefront/cancel-order";
import { themeVariables } from "@/lib/store-themes";
import { storeFontVariables } from "../fonts";
import "../storefront.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  return {
    title: { absolute: store ? `Your order | ${store.brand.name}` : "Your order" },
    robots: { index: false, follow: false }, referrer: "no-referrer",
  };
}

/** Where a delay notice's "cancel for a full refund" link lands. The order is found in the browser. */
export default async function CancelPage({ params }: Params) {
  const store = await getStorefront((await params).slug);
  const body = <main className="st-section st-thanks">
    <div className="st-shell narrow">
      <h1 className="st-display">Your order</h1>
      <CancelOrder />
    </div>
  </main>;
  // The store may have been unpublished since the order; the customer can still cancel.
  return store ? <StoreFrame store={store}>{body}</StoreFrame>
    : <div className={`st ${storeFontVariables}`} data-theme="clean-minimal" style={themeVariables("clean-minimal", { accent: null }) as React.CSSProperties}>{body}</div>;
}

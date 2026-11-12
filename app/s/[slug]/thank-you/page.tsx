import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, Mail, PackageCheck, Truck } from "lucide-react";
import { getStorefront } from "@/lib/storefront";
import { StoreFrame } from "@/components/storefront/store-frame";
import { TikTokEvent } from "@/components/storefront/tiktok";
import { findCheckout } from "@/lib/checkout";
import "../storefront.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The paid checkout this page was reached from, for the store's ad pixel. Only ever the purchase's own figures. */
async function purchaseFor(storeProductId: string, ref: unknown) {
  if (typeof ref !== "string" || !UUID.test(ref)) return null;
  const checkout = await findCheckout(ref);
  if (!checkout || checkout.kind !== "physical" || checkout.product_id !== storeProductId || !checkout.stripe_session_id || !checkout.physical_snapshot) return null;
  const item = checkout.physical_snapshot.items[0];
  return {
    eventId: checkout.id,
    params: {
      content_type: "product", currency: checkout.currency.toUpperCase(), value: checkout.amount / 100,
      contents: [{ content_id: item.productId, content_name: item.name, quantity: item.quantity, price: item.unitAmount / 100 }],
    },
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  // A confirmation page is never useful in search results.
  return { title: { absolute: store ? `Order confirmed | ${store.brand.name}` : "Order confirmed" }, robots: { index: false, follow: false } };
}

export default async function ThankYouPage({ params, searchParams }: Params) {
  const store = await getStorefront((await params).slug);
  if (!store) notFound();
  const purchase = store.brand.tiktokPixelId ? await purchaseFor(store.product.id, (await searchParams).ref) : null;
  // Total time from ordering: processing (from the store's policies) plus the shipping option's transit time.
  const processing = store.policies?.processingDays ?? { min: 0, max: 0 };
  const earliest = store.shipping.length ? processing.min + Math.min(...store.shipping.map((rate) => rate.minDays)) : 0;
  const latest = store.shipping.length ? processing.max + Math.max(...store.shipping.map((rate) => rate.maxDays)) : 0;
  const steps = [
    { icon: Mail, title: "Confirmation on its way", text: "We've emailed your receipt and order details. Check your spam folder if it isn't there in a few minutes." },
    { icon: PackageCheck, title: "We prepare your order", text: "Your order is packed and handed to the carrier." },
    { icon: Truck, title: "Tracking by email", text: latest ? `You'll get a tracking link when it ships. Most orders arrive ${earliest}–${latest} business days after ordering, depending on the shipping you chose.` : "You'll get a tracking link as soon as it ships." },
  ];
  return (
    <StoreFrame store={store}>
      {purchase && <TikTokEvent event="Purchase" params={purchase.params} eventId={purchase.eventId} />}
      <main className="st-section st-thanks">
        <div className="st-shell narrow">
          <span className="st-icon large st-thanks-mark"><CircleCheck size={32} strokeWidth={1.6} aria-hidden /></span>
          <h1 className="st-display">Thank you. Your order is confirmed.</h1>
          <p className="st-lede">Your payment went through and your {store.product.name} is reserved for you.</p>
          <ol className="st-thanks-steps">
            {steps.map((step) => <li key={step.title}><span className="st-icon"><step.icon size={22} strokeWidth={1.75} aria-hidden /></span><div><h2>{step.title}</h2><p>{step.text}</p></div></li>)}
          </ol>
          <div className="st-thanks-actions">
            <a className="st-button" href={`/s/${store.product.slug}`}>Back to {store.brand.name}</a>
            {store.brand.supportEmail && <p>Need to change your address? Email <a href={`mailto:${store.brand.supportEmail}`}>{store.brand.supportEmail}</a> before it ships.</p>}
          </div>
        </div>
      </main>
    </StoreFrame>
  );
}

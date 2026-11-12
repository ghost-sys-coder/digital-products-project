import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CircleCheck, Mail, PackageCheck, Truck } from "lucide-react";
import { getStorefront } from "@/lib/storefront";
import { themeVariables, THEME_TOKENS } from "@/lib/store-themes";
import { storeFontVariables } from "../fonts";
import "../storefront.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  // A confirmation page is never useful in search results.
  return { title: { absolute: store ? `Order confirmed | ${store.brand.name}` : "Order confirmed" }, robots: { index: false, follow: false } };
}

export default async function ThankYouPage({ params }: Params) {
  const store = await getStorefront((await params).slug);
  if (!store) notFound();
  const fastest = [...store.shipping].sort((a, b) => a.maxDays - b.maxDays)[0];
  const steps = [
    { icon: Mail, title: "Confirmation on its way", text: "We've emailed your receipt and order details. Check your spam folder if it isn't there in a few minutes." },
    { icon: PackageCheck, title: "We prepare your order", text: "Your order is packed and handed to the carrier." },
    { icon: Truck, title: "Tracking by email", text: fastest ? `You'll get a tracking link when it ships. Delivery usually takes ${fastest.minDays}–${Math.max(...store.shipping.map((rate) => rate.maxDays))} business days, depending on the shipping you chose.` : "You'll get a tracking link as soon as it ships." },
  ];
  return (
    <div className={`st ${storeFontVariables}`} data-theme={store.theme} data-dark={THEME_TOKENS[store.theme].dark || undefined} style={themeVariables(store.theme, store.brand) as React.CSSProperties}>
      <header className="st-header">
        <div className="st-shell st-header-inner">
          <a className="st-logo" href={`/s/${store.product.slug}`} aria-label={`${store.brand.name} home`}>
            {store.brand.logo ? <Image src={store.mediaBase + store.brand.logo} alt={store.brand.name} width={160} height={40} /> : <span>{store.brand.name}</span>}
          </a>
        </div>
      </header>
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
    </div>
  );
}

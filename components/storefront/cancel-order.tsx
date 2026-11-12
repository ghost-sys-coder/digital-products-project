"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CircleCheck, PackageX } from "lucide-react";

type Summary = {
  reference: string; brand: string; supportEmail: string | null; items: { name: string; variant: string; quantity: number }[];
  total: number | null; currency: string; shipBy: string; cancellable: boolean; status: string; refunded?: number | null;
};

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
const day = (value: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

// The link's secret is after "#", which browsers never send to the server.
const subscribe = (change: () => void) => { window.addEventListener("hashchange", change); return () => window.removeEventListener("hashchange", change); };
const readToken = () => window.location.hash.slice(1);

async function call(token: string, action: "preview" | "cancel") {
  const response = await fetch("/api/orders/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as Summary;
}

export function CancelOrder() {
  const token = useSyncExternalStore(subscribe, readToken, () => null);
  if (token === null) return <p className="st-lede" aria-live="polite">Finding your order…</p>;
  // A different link is a different order: start fresh.
  return <OrderCancellation key={token} token={token} />;
}

function OrderCancellation({ token }: { token: string }) {
  const [order, setOrder] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    call(token, "preview").then((summary) => { if (live) setOrder(summary); }, (cause: Error) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [token]);

  if (token === "") return <p className="st-lede">This link is incomplete. Open it again from your email.</p>;
  if (error && !order) return <div className="st-cancel-card"><PackageX size={28} strokeWidth={1.6} aria-hidden /><p className="st-lede">{error}</p></div>;
  if (!order) return <p className="st-lede" aria-live="polite">Finding your order…</p>;

  const total = order.total !== null ? money(order.total, order.currency) : null;
  if (order.status === "cancelled") {
    const refunded = order.refunded ?? order.total;
    return <div className="st-cancel-card" role="status">
      <span className="st-icon large"><CircleCheck size={30} strokeWidth={1.6} aria-hidden /></span>
      <h2>Your order is cancelled.</h2>
      <p>{refunded ? `We've refunded ${money(refunded, order.currency)} to the card you paid with. ` : ""}Refunds usually show within 5 to 10 business days, depending on your bank. A confirmation is on its way to your inbox.</p>
    </div>;
  }

  return <div className="st-cancel-card">
    <p className="st-eyebrow">Order {order.reference}</p>
    <ul className="st-cancel-items">{order.items.map((item, index) => <li key={index}><span>{item.quantity} × {item.name}{item.variant ? ` (${item.variant})` : ""}</span></li>)}</ul>
    {total && <p className="st-cancel-total"><span>Total paid</span><strong>{total}</strong></p>}
    {order.cancellable ? <>
      <p>We now expect to ship your order by <strong>{day(order.shipBy)}</strong>. If you&apos;d rather not wait, you can cancel it now for a full refund{total ? ` of ${total}` : ""}, including shipping.</p>
      {error && <p className="st-cancel-error" role="alert">{error}</p>}
      {!confirming
        ? <div className="st-cancel-actions"><button type="button" className="st-button" onClick={() => setConfirming(true)}>Cancel my order</button></div>
        : <div className="st-cancel-actions">
            <button type="button" className="st-button" disabled={pending} onClick={async () => {
              setPending(true); setError("");
              try { setOrder(await call(token, "cancel")); } catch (cause) { setError((cause as Error).message); }
              setPending(false);
            }}>{pending ? "Cancelling…" : `Yes, cancel and refund${total ? ` ${total}` : ""}`}</button>
            <button type="button" className="st-button st-button-ghost" disabled={pending} onClick={() => setConfirming(false)}>Keep my order</button>
          </div>}
      <p className="st-cancel-note">Happy to wait? You don&apos;t need to do anything{order.supportEmail ? <>, or email <a href={`mailto:${order.supportEmail}`}>{order.supportEmail}</a> with any questions</> : ""}.</p>
    </> : <p>This order has already shipped, so it can&apos;t be cancelled here.{order.supportEmail ? <> Email <a href={`mailto:${order.supportEmail}`}>{order.supportEmail}</a> and we&apos;ll help with a return.</> : " Reply to your email and we'll help with a return."}</p>}
  </div>;
}

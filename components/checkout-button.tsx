"use client";
import { useRef, useState } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";

export function CheckoutButton({ productId, price }: { productId: string; price: string }) {
  const requestId = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function checkout() {
    setPending(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, checkoutId: requestId.current }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) requestId.current = null;
        throw new Error(data.error || "Checkout is unavailable. Please try again.");
      }
      window.location.assign(data.url);
    } catch (error) { setError((error as Error).message); setPending(false); }
  }
  return <div className="checkout-control"><button type="button" className="button primary purchase-button" onClick={checkout} disabled={pending}>{pending ? "Opening checkout…" : `Get the kit · ${price}`}<ArrowUpRight size={19} /></button><span className="checkout-note"><LockKeyhole size={13} /> Secure payment with Stripe · Instant email delivery</span>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}

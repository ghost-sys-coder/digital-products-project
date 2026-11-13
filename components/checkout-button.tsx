"use client";
import { useRef, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

/**
 * Starts Stripe Checkout for a digital product. `compact` is the version in the phone buy bar:
 * a shorter label and no note underneath. Styles: app/studio.css.
 */
export function CheckoutButton({ productId, price, compact = false }: { productId: string; price: string; compact?: boolean }) {
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
  return (
    <div className={`vc-checkout${compact ? " is-compact" : ""}`}>
      <button type="button" className="vc-button vc-buy-button" onClick={checkout} disabled={pending}>
        {pending ? "Opening checkout…" : compact ? "Buy now" : `Buy now · ${price}`}<ArrowRight size={18} aria-hidden="true" />
      </button>
      {!compact && <span className="vc-checkout-note"><LockKeyhole size={14} aria-hidden="true" /> Secure payment with Stripe. Your download link arrives by email.</span>}
      {error && <p className="vc-checkout-error" role="alert">{error}</p>}
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, PackageCheck, Send, ShoppingCart, Truck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { FulfillmentStatus } from "@/lib/database.types";

/** Click to copy one value, for pasting into a supplier's checkout form. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="copy-field" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* clipboard blocked: the text stays selectable */ }
  }} aria-label={`Copy ${label}`}><span className="copy-field-label">{label}</span><span className="copy-field-value">{value}</span>{copied ? <Check size={14} /> : <Copy size={14} />}</button>;
}

type Props = {
  orderId: string; orderRef: string; customer: string; status: FulfillmentStatus; supplierRef: string | null;
  tracking: { number: string | null; carrier: string | null; url: string | null; emailed: boolean };
};

/** Confirms a cancellation; stays open while it saves so the owner sees it finish. */
function CancelOrderDialog({ open, onOpenChange, orderRef, customer, pending, onConfirm, returnFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; orderRef: string; customer: string;
  pending: boolean; onConfirm: () => void; returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  return <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <AlertDialogContent className="confirm-dialog" initialFocus={keepRef} finalFocus={returnFocus}>
      <div className="confirm-dialog-icon danger" aria-hidden="true"><Ban size={22} /></div>
      <AlertDialogHeader>
        <AlertDialogTitle>Cancel order {orderRef}?</AlertDialogTitle>
        <AlertDialogDescription>
          {customer ? `${customer}'s order` : "This order"} moves to Cancelled and can&apos;t be shipped from here. Cancelling doesn&apos;t refund the customer: refund the payment in your Stripe dashboard, then let them know.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel ref={keepRef} className="button secondary" disabled={pending}>Keep order</AlertDialogCancel>
        <AlertDialogAction type="button" className="button danger" disabled={pending} onClick={onConfirm} aria-label={pending ? "Cancelling order" : "Cancel order"}><Ban size={15} />{pending ? "Cancelling…" : "Cancel order"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function FulfillmentActions({ orderId, orderRef, customer, status, supplierRef, tracking }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [showTracking, setShowTracking] = useState(status === "ordered");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  async function send(action: string, fields: Record<string, unknown> = {}, success = "Saved.") {
    setPending(action); setMessage(null);
    try {
      const response = await fetch("/api/admin/fulfillment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, expected: status, action, ...fields }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That didn't save. Please try again.");
      setMessage({ text: success, failed: false });
      router.refresh();
    } catch (error) {
      setMessage({ text: (error as Error).message, failed: true });
      // A 502 means the change saved but the email failed: show the new status anyway.
      router.refresh();
    } finally { setPending(null); }
  }

  const trackingForm = (
    <form className="fulfil-form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      send("shipped", {
        carrier: form.get("carrier"), trackingNumber: form.get("trackingNumber"), trackingUrl: form.get("trackingUrl"), notify: form.get("notify") === "on",
      }, form.get("notify") === "on" ? "Marked as shipped. The customer has their tracking link." : "Tracking saved.");
    }}>
      <div className="fulfil-fields">
        <label>Tracking number<input name="trackingNumber" defaultValue={tracking.number ?? ""} required maxLength={100} autoComplete="off" /></label>
        <label>Carrier <span className="optional">Optional</span><input name="carrier" defaultValue={tracking.carrier ?? ""} maxLength={60} placeholder="e.g. USPS, Cainiao, YunExpress" /></label>
      </div>
      <label>Tracking link <span className="optional">Optional</span><input name="trackingUrl" type="url" defaultValue={tracking.url ?? ""} maxLength={2000} placeholder="https://" /></label>
      <span className="field-help">No link? We&apos;ll send a 17TRACK link, which follows most AliExpress shipments.</span>
      <label className="fulfil-check"><input type="checkbox" name="notify" defaultChecked /> Email the customer their tracking link</label>
      <button className="button primary small" disabled={!!pending}><Truck size={14} />{pending === "shipped" ? "Saving…" : status === "shipped" ? "Update tracking" : "Mark as shipped"}</button>
    </form>
  );

  const cancel = <>
    <button type="button" ref={cancelButton} className="button secondary small fulfil-cancel" disabled={!!pending} onClick={() => setConfirmCancel(true)}><Ban size={14} />Cancel order</button>
    <CancelOrderDialog open={confirmCancel} onOpenChange={setConfirmCancel} orderRef={orderRef} customer={customer}
      pending={pending === "cancelled"} returnFocus={cancelButton}
      onConfirm={async () => { await send("cancelled", {}, "Order cancelled. Remember to refund it in Stripe."); setConfirmCancel(false); }} />
  </>;

  return <div className="fulfil-actions">
    {status === "needs_ordering" && <>
      <form className="fulfil-form" onSubmit={(event) => {
        event.preventDefault();
        send("ordered", { supplierRef: new FormData(event.currentTarget).get("supplierRef") }, "Marked as ordered.");
      }}>
        <label>Supplier order number <span className="optional">Optional</span><input name="supplierRef" maxLength={200} autoComplete="off" placeholder="e.g. AliExpress order 8123…" /></label>
        <button className="button primary small" disabled={!!pending}><ShoppingCart size={14} />{pending === "ordered" ? "Saving…" : "Mark as ordered"}</button>
      </form>
      <div className="fulfil-row">
        <button type="button" className="text-button" onClick={() => setShowTracking((open) => !open)}>{showTracking ? "Hide tracking" : "Already have tracking? Add it now"}</button>
        {cancel}
      </div>
      {showTracking && trackingForm}
    </>}
    {status === "ordered" && <>
      {supplierRef && <p className="muted">Supplier order: {supplierRef}</p>}
      {trackingForm}
      <div className="fulfil-row">{cancel}</div>
    </>}
    {status === "shipped" && <>
      <div className="fulfil-row">
        <button type="button" className="button primary small" disabled={!!pending} onClick={() => send("delivered", {}, "Marked as delivered.")}><PackageCheck size={14} />{pending === "delivered" ? "Saving…" : "Mark as delivered"}</button>
        <button type="button" className="button secondary small" disabled={!!pending} onClick={() => send("resend_tracking", {}, "Tracking email sent again.")}><Send size={14} />{pending === "resend_tracking" ? "Sending…" : "Resend tracking email"}</button>
      </div>
      <details className="fulfil-details"><summary>Update tracking</summary>{trackingForm}</details>
    </>}
    {status === "delivered" && tracking.number && <div className="fulfil-row">
      <button type="button" className="button secondary small" disabled={!!pending} onClick={() => send("resend_tracking", {}, "Tracking email sent again.")}><Send size={14} />{pending === "resend_tracking" ? "Sending…" : "Resend tracking email"}</button>
    </div>}
    {status === "cancelled" && <p className="muted">Cancelled. If you haven&apos;t already, refund the payment in your Stripe dashboard.</p>}
    {message && <p role="status" className={message.failed ? "form-error" : "save-success"}>{!message.failed && <Check size={15} />}{message.text}</p>}
  </div>;
}

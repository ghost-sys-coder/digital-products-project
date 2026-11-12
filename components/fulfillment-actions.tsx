"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Clock, Copy, PackageCheck, Send, ShoppingCart, Truck } from "lucide-react";
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
  /** The ship-by date the customer was last given, the original promise, and notices sent so far. */
  delay: { shipBy: string; originalShipBy: string; notices: number };
  /** The amount a refund would return, formatted. */
  total: string | null;
};

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Emails the customer a new ship-by date with a link to cancel for a full refund. */
function DelayNoticeForm({ delay, pending, onSend }: { delay: Props["delay"]; pending: boolean; onSend: (fields: { shipBy: string; reason: string }) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const earliest = addDays(delay.shipBy > today ? delay.shipBy : today, 1);
  const [shipBy, setShipBy] = useState(addDays(earliest, 6));
  const needsConsent = delay.notices > 0 || daysBetween(delay.originalShipBy, shipBy) > 30;
  return <form className="fulfil-form" onSubmit={(event) => {
    event.preventDefault();
    onSend({ shipBy, reason: String(new FormData(event.currentTarget).get("reason") ?? "") });
  }}>
    <label>New ship-by date<input type="date" name="shipBy" required min={earliest} max={addDays(today, 120)} value={shipBy} onChange={(event) => setShipBy(event.target.value)} /></label>
    <label>Reason <span className="optional">Optional, shown to the customer</span><textarea name="reason" maxLength={300} rows={2} placeholder="Our supplier is restocking this colour." /></label>
    <span className="field-help">{needsConsent
      ? (delay.notices > 0 ? "This is a second delay" : "This is more than 30 days after the original promise") + ", so the customer must agree to wait. The email asks them to reply; if they don't by the new date, cancel and refund the order."
      : "The email offers a full refund. If the customer is happy to wait, they don't need to reply."}</span>
    <button className="button secondary small" disabled={pending}><Send size={14} />{pending ? "Sending…" : "Email delay notice"}</button>
  </form>;
}

/** Confirms a cancellation; stays open while it saves so the owner sees it finish. */
function CancelOrderDialog({ open, onOpenChange, orderRef, customer, total, pending, onConfirm, returnFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; orderRef: string; customer: string; total: string | null;
  pending: boolean; onConfirm: (refund: boolean) => void; returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const [refund, setRefund] = useState(true);
  return <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <AlertDialogContent className="confirm-dialog" initialFocus={keepRef} finalFocus={returnFocus}>
      <div className="confirm-dialog-icon danger" aria-hidden="true"><Ban size={22} /></div>
      <AlertDialogHeader>
        <AlertDialogTitle>Cancel order {orderRef}?</AlertDialogTitle>
        <AlertDialogDescription>
          {customer ? `${customer}'s order` : "This order"} moves to Cancelled and can&apos;t be shipped from here. If you&apos;ve ordered it from your supplier, cancel that order too.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <label className="fulfil-check confirm-dialog-option"><input type="checkbox" checked={refund} disabled={pending} onChange={(event) => setRefund(event.target.checked)} /> Refund {total ?? "the full payment"} now and email the customer</label>
      <AlertDialogFooter>
        <AlertDialogCancel ref={keepRef} className="button secondary" disabled={pending}>Keep order</AlertDialogCancel>
        <AlertDialogAction type="button" className="button danger" disabled={pending} onClick={() => onConfirm(refund)} aria-label={pending ? "Cancelling order" : refund ? "Cancel and refund" : "Cancel order"}><Ban size={15} />{pending ? "Cancelling…" : refund ? "Cancel and refund" : "Cancel order"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function FulfillmentActions({ orderId, orderRef, customer, status, supplierRef, tracking, delay, total }: Props) {
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
    <CancelOrderDialog open={confirmCancel} onOpenChange={setConfirmCancel} orderRef={orderRef} customer={customer} total={total}
      pending={pending === "cancelled"} returnFocus={cancelButton}
      onConfirm={async (refund) => { await send("cancelled", { refund }, refund ? "Cancelled and refunded. The customer has been emailed." : "Order cancelled. Remember to refund it in Stripe."); setConfirmCancel(false); }} />
  </>;
  const delayNotice = <details className="fulfil-details">
    <summary><Clock size={13} aria-hidden /> {delay.notices ? "Send another delay notice" : "Running late? Email a delay notice"}</summary>
    <DelayNoticeForm delay={delay} pending={pending === "delay_notice"} onSend={(fields) => send("delay_notice", fields, "Delay notice sent. The customer has a new date and a link to cancel.")} />
  </details>;

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
      {delayNotice}
    </>}
    {status === "ordered" && <>
      {supplierRef && <p className="muted">Supplier order: {supplierRef}</p>}
      {trackingForm}
      <div className="fulfil-row">{cancel}</div>
      {delayNotice}
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

    {message && <p role="status" className={message.failed ? "form-error" : "save-success"}>{!message.failed && <Check size={15} />}{message.text}</p>}
  </div>;
}

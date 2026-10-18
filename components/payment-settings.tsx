"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, CreditCard, RefreshCw } from "lucide-react";

export type PaymentSettingsProps = {
  enabled: boolean; configured: boolean; livemode: boolean;
  connection: { accountId: string; status: "connected" | "restricted" | "disconnected"; country: string | null; requirementsCount: number } | null;
  result?: string;
};
export function PaymentSettings({ enabled, configured, livemode, connection, result }: PaymentSettingsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const connected = connection?.status === "connected";
  async function action(name: string) {
    setPending(name); setError("");
    try {
      const response = await fetch(`/api/admin/payments/stripe/${name}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update payment settings.");
      if (name === "start") { window.location.assign(data.url); return; }
      setConfirmDisconnect(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setPending(null); }
  }
  return <section className="workspace-panel form-panel settings-form payment-settings" aria-labelledby="payment-heading">
    <div className="payment-heading"><div><span className="eyebrow">WHERE YOUR SALES LAND</span><h2 id="payment-heading">Payments</h2></div><span className="payment-mode">{livemode ? "Live payments" : "Test payments"}</span></div>
    <div className="payment-provider"><span className="payment-icon"><CreditCard size={23} aria-hidden="true" /></span><div><h3>Stripe</h3><p className="muted">Secure checkout. Payments to your own account.</p></div><span className={`payment-status ${connected ? "is-connected" : ""}`}>{connection ? (connected ? "Connected" : connection.status === "restricted" ? "Action required" : "Disconnected") : "Current account"}</span></div>
    {connection ? <><p className="payment-detail">{connection.accountId}{connection.country ? ` · ${connection.country}` : ""}</p><p className="muted">{connected ? "Your connected account receives new sales. Manage payouts, refunds, and disputes in Stripe." : connection.status === "disconnected" ? "New checkouts are paused. Reconnect Stripe to accept payments again. Existing orders remain available." : "Finish your Stripe account setup before accepting payments."}</p>{connection.requirementsCount > 0 && <p className="muted">Stripe needs {connection.requirementsCount} account {connection.requirementsCount === 1 ? "detail" : "details"}. Open Stripe to review them.</p>}</> : <p className="muted">Your store continues to use its current Stripe account. Connect a different account when you’re ready.</p>}
    {result && <p role="status" className={result === "failed" ? "form-error" : "save-success"}>{result === "failed" ? "The connection could not be completed. Please try again." : result === "cancelled" ? "Connection cancelled. Your payment settings have not changed." : result === "restricted" ? "Account linked. Finish its setup in Stripe to accept payments." : <><Check size={16} />Your Stripe account is connected.</>}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="payment-actions"><button className="button primary" disabled={!!pending || !enabled || !configured} onClick={() => action("start")}><ArrowUpRight size={16} />{pending === "start" ? "Opening Stripe…" : connection ? "Reconnect Stripe" : "Connect Stripe"}</button>{connection && connection.status !== "disconnected" && <><button className="button secondary" disabled={!!pending || !enabled} onClick={() => action("refresh")}><RefreshCw size={15} />{pending === "refresh" ? "Checking…" : "Check status"}</button><a className="text-link" href={livemode ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test/dashboard"} target="_blank" rel="noopener noreferrer">Open Stripe <ArrowUpRight size={14} /></a></>}</div>
    {(!enabled || !configured) && <p className="muted payment-note">Account linking will be available once the store’s Stripe connection setup is complete.</p>}
    {connection && connection.status !== "disconnected" && enabled && <div className="payment-disconnect">{confirmDisconnect ? <><p>Disconnect Stripe? New checkouts will pause until you reconnect.</p><button className="text-link" disabled={!!pending} onClick={() => action("disconnect")}>{pending === "disconnect" ? "Disconnecting…" : "Yes, disconnect"}</button><button className="text-link" disabled={!!pending} onClick={() => setConfirmDisconnect(false)}>Keep connected</button></> : <button className="text-link" disabled={!!pending} onClick={() => setConfirmDisconnect(true)}>Disconnect account</button>}</div>}
    <p className="muted payment-note">PayPal connections are planned for a future release.</p>
  </section>;
}

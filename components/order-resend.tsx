"use client";
import { useState } from "react";
import { Send } from "lucide-react";

export function OrderResend({ sessionId, email }: { sessionId: string; email: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  return <details className="order-resend"><summary>Resend email</summary><form onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/orders/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, email: form.get("email") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Resend failed.");
      setFailed(false); setMessage("A fresh download link is on its way.");
    } catch (error) { setFailed(true); setMessage((error as Error).message); } finally { setPending(false); }
  }}><label>Delivery email<input name="email" type="email" defaultValue={email} required maxLength={254} /></label><span className="field-help">Replaces the old link and resets its download limit.</span><button disabled={pending} className="button secondary small"><Send size={14} />{pending ? "Sending…" : "Send fresh link"}</button>{message && <p role="status" className={failed ? "form-error" : "save-success"}>{message}</p>}</form></details>;
}

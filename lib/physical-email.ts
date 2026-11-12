import "server-only";
import { Resend } from "resend";
import { getDeployment, getEnv } from "./env";
import { emailAllowed } from "./deployment-rules";
import type { Order } from "./orders";

// Order confirmation for physical stores. Each store sends under its own brand name, from the
// platform's verified domain, with replies going to the brand's support address.

const FALLBACK_REPLY_TO = "support@veilcode.studio";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}
/** A display name safe for an email From header. */
export function senderName(brand: string) {
  const clean = brand.replace(/[^\p{L}\p{N} &'.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return clean || "Order update";
}

export function buildOrderConfirmation(order: Order) {
  const snapshot = order.physical_snapshot;
  const address = order.shipping_address;
  if (!snapshot || !address) throw new Error("Order is missing physical details");
  const currency = order.currency ?? snapshot.currency;
  const brand = snapshot.brand.name;
  const firstName = (order.customer_name ?? address.name ?? "").trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Thanks, ${firstName}!` : "Thanks for your order!";
  const items = snapshot.items.map((item) => ({
    title: item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name,
    detail: `${item.quantity} × ${money(item.unitAmount, currency)}`,
  }));
  const shipping = snapshot.shipping;
  const shippingLine = shipping
    ? `${shipping.name}${shipping.amount ? ` · ${money(shipping.amount, currency)}` : " · Free"} · usually ${shipping.minDays}–${shipping.maxDays} business days`
    : null;
  const addressLines = [address.name, address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(", "), address.country]
    .filter((line): line is string => !!line && !!line.trim());
  const total = order.amount_total !== null ? money(order.amount_total, currency) : null;
  const reference = order.stripe_session_id.slice(-8).toUpperCase();
  const subject = `${brand}: order confirmed`;

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#171717;line-height:1.6;max-width:560px">
<p style="font-size:20px;font-weight:600;margin:0 0 8px">${escapeHtml(greeting)}</p>
<p>Your ${escapeHtml(brand)} order is confirmed. We're getting it ready and will email you a tracking link as soon as it ships.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">
${items.map((item) => `<tr><td style="padding:10px 0;border-top:1px solid #e5e5e5">${escapeHtml(item.title)}</td><td style="padding:10px 0;border-top:1px solid #e5e5e5;text-align:right;white-space:nowrap">${escapeHtml(item.detail)}</td></tr>`).join("\n")}
${shippingLine ? `<tr><td colspan="2" style="padding:10px 0;border-top:1px solid #e5e5e5;color:#555">Shipping: ${escapeHtml(shippingLine)}</td></tr>` : ""}
${total ? `<tr><td style="padding:10px 0;border-top:1px solid #e5e5e5;font-weight:600">Total paid</td><td style="padding:10px 0;border-top:1px solid #e5e5e5;text-align:right;font-weight:600">${escapeHtml(total)}</td></tr>` : ""}
</table>
<p style="margin:0 0 4px;font-weight:600">Shipping to</p>
<p style="margin:0 0 20px;color:#333">${addressLines.map(escapeHtml).join("<br>")}</p>
<p>Something not right with your address or order? Reply to this email as soon as possible and we'll fix it before it ships.</p>
<p style="color:#777;font-size:13px">Order reference ${escapeHtml(reference)}</p>
<p>${escapeHtml(brand)}</p>
</div>`;
  const text = `${greeting}

Your ${brand} order is confirmed. We're getting it ready and will email you a tracking link as soon as it ships.

${items.map((item) => `${item.title}: ${item.detail}`).join("\n")}${shippingLine ? `\nShipping: ${shippingLine}` : ""}${total ? `\nTotal paid: ${total}` : ""}

Shipping to:
${addressLines.join("\n")}

Something not right with your address or order? Reply to this email as soon as possible and we'll fix it before it ships.

Order reference ${reference}
${brand}`;
  return { subject, html, text };
}

export async function sendOrderConfirmation(order: Order) {
  const env = getEnv();
  const deployment = getDeployment();
  if (!deployment.production && !emailAllowed(order.email, deployment.emailAllowlist)) {
    // Fail closed, as digital delivery does: the order stays pending. Never log the address itself.
    console.warn("Non-production email blocked: recipient is not on EMAIL_ALLOWLIST", { sessionId: order.stripe_session_id });
    throw new Error("Recipient is not allowed outside production");
  }
  const message = buildOrderConfirmation(order);
  const brand = order.physical_snapshot!.brand;
  const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: `${senderName(brand.name)} <orders@mail.veilcode.studio>`,
    replyTo: brand.supportEmail ?? FALLBACK_REPLY_TO,
    to: order.email,
    ...message,
    subject: deployment.production ? message.subject : `[${deployment.env === "preview" ? "Preview" : "Dev"}] ${message.subject}`,
  }, {
    // One confirmation per order, even when Stripe retries the webhook.
    idempotencyKey: `order-confirmation-${order.stripe_session_id}`,
    signal: AbortSignal.timeout(15_000),
  });
  if (error || !data) throw new Error("Confirmation email was not accepted by Resend");
}

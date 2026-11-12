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

/** A universal tracking page when the carrier gave no link; 17TRACK covers most AliExpress carriers. */
export function trackingLink(trackingNumber: string, trackingUrl: string | null | undefined) {
  return trackingUrl || `https://t.17track.net/en#nums=${encodeURIComponent(trackingNumber)}`;
}

export function buildTrackingEmail(order: Order) {
  const snapshot = order.physical_snapshot;
  if (!snapshot || !order.tracking_number) throw new Error("Order has no tracking to send");
  const brand = snapshot.brand.name;
  const firstName = (order.customer_name ?? order.shipping_address?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const link = trackingLink(order.tracking_number, order.tracking_url);
  const items = snapshot.items.map((item) => `${item.quantity} × ${item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name}`);
  const carrier = order.tracking_carrier ? `${order.tracking_carrier} · ` : "";
  const estimate = snapshot.shipping && snapshot.shipping.maxDays
    ? `Most orders arrive within ${snapshot.shipping.minDays}–${snapshot.shipping.maxDays} business days of ordering. Tracking can take a day or two to show the first update.`
    : "Tracking can take a day or two to show the first update.";
  const reference = order.stripe_session_id.slice(-8).toUpperCase();
  const subject = `${brand}: your order has shipped`;
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#171717;line-height:1.6;max-width:560px">
<p style="font-size:20px;font-weight:600;margin:0 0 8px">${escapeHtml(firstName ? `Good news, ${firstName}!` : "Good news!")}</p>
<p>Your ${escapeHtml(brand)} order is on its way.</p>
<p style="margin:0;color:#333">${items.map(escapeHtml).join("<br>")}</p>
<p style="margin:20px 0 6px;color:#555">${escapeHtml(`${carrier}Tracking number ${order.tracking_number}`)}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#171717;color:#fff;text-decoration:none;font-weight:600">Track your order</a></p>
<p style="color:#555">${escapeHtml(estimate)}</p>
<p>Questions about your delivery? Just reply to this email.</p>
<p style="color:#777;font-size:13px">Order reference ${escapeHtml(reference)}</p>
<p>${escapeHtml(brand)}</p>
</div>`;
  const text = `${firstName ? `Good news, ${firstName}!` : "Good news!"}

Your ${brand} order is on its way.

${items.join("\n")}

${carrier}Tracking number ${order.tracking_number}
Track your order: ${link}

${estimate}

Questions about your delivery? Just reply to this email.

Order reference ${reference}
${brand}`;
  return { subject, html, text };
}

export async function sendTrackingEmail(order: Order, { resend = false } = {}) {
  const env = getEnv();
  const deployment = getDeployment();
  if (!deployment.production && !emailAllowed(order.email, deployment.emailAllowlist)) {
    console.warn("Non-production email blocked: recipient is not on EMAIL_ALLOWLIST", { sessionId: order.stripe_session_id });
    throw new Error("Recipient is not allowed outside production");
  }
  const message = buildTrackingEmail(order);
  const brand = order.physical_snapshot!.brand;
  const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: `${senderName(brand.name)} <orders@mail.veilcode.studio>`,
    replyTo: brand.supportEmail ?? FALLBACK_REPLY_TO,
    to: order.email,
    ...message,
    subject: deployment.production ? message.subject : `[${deployment.env === "preview" ? "Preview" : "Dev"}] ${message.subject}`,
  }, {
    // One email per tracking number; an explicit resend from the owner always sends.
    idempotencyKey: resend ? `tracking-${order.stripe_session_id}-${Date.now()}` : `tracking-${order.stripe_session_id}-${order.tracking_number}`,
    signal: AbortSignal.timeout(15_000),
  });
  if (error || !data) throw new Error("Tracking email was not accepted by Resend");
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

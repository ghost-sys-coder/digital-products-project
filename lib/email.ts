import "server-only";
import { Resend } from "resend";
import { getDeployment, getEnv } from "./env";
import { emailAllowed } from "./deployment-rules";
import type { Product } from "./products";
import { MAX_DOWNLOADS, TOKEN_LIFETIME_DAYS } from "./tokens";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function buildDeliveryEmail(product: Product, token: string) {
  const url = new URL("/api/download", getEnv().APP_URL);
  url.searchParams.set("token", token);
  const downloadUrl = url.toString();
  const limit = `This link works for ${TOKEN_LIFETIME_DAYS} days and up to ${MAX_DOWNLOADS} downloads. Save your download somewhere safe.`;
  const resourcesHtml = product.templatesUrl ? `<h2 style="font-size:18px">2. Get the editable templates</h2>
<p><a style="color:#2B59FF" href="${escapeHtml(product.templatesUrl)}">Open the template folder</a></p>
<p>Open any template and choose <strong>File &gt; Make a copy</strong> to save it to your own Google Drive.</p>
<p>Start with the &quot;00 Start Here&quot; file, if included.</p>` : "";
  const resourcesText = product.templatesUrl ? `\n\n2. Get the editable templates\nOpen the template folder: ${product.templatesUrl}\nOpen any template and choose File > Make a copy to save it to your own Google Drive.\n\nStart with the "00 Start Here" file, if included.` : "";
  const fileLabel = product.downloadFilename.toLowerCase().endsWith(".pdf") ? "Download the guide (PDF)" : "Download your kit (ZIP)";
  return {
    subject: product.emailSubject,
    html: `<div style="font-family:system-ui,sans-serif;color:#171717;line-height:1.6;max-width:560px">
<p>Thanks for buying <strong>${escapeHtml(product.shortName)}</strong>.</p>
<h2 style="font-size:18px">1. ${fileLabel}</h2>
<p><a style="color:#2B59FF" href="${escapeHtml(downloadUrl)}">Download ${escapeHtml(product.shortName)}</a></p>
<p>${limit}</p>
${resourcesHtml}
<p>Questions or problems? Just reply to this email.</p>
<p>Frank<br>VeilCode Studio</p>
</div>`,
    text: `Thanks for buying ${product.shortName}.

1. ${fileLabel}
Download ${product.shortName}: ${downloadUrl}
${limit}${resourcesText}

Questions or problems? Just reply to this email.

Frank
VeilCode Studio`,
  };
}

export async function sendDeliveryEmail(input: {
  email: string; sessionId: string; product: Product; token: string; tokenHash: string;
}) {
  const env = getEnv();
  const deployment = getDeployment();
  if (!deployment.production && !emailAllowed(input.email, deployment.emailAllowlist)) {
    // Fail closed: the order stays pending. Never log the address itself.
    console.warn("Non-production email blocked: recipient is not on EMAIL_ALLOWLIST", { sessionId: input.sessionId });
    throw new Error("Recipient is not allowed outside production");
  }
  const message = buildDeliveryEmail(input.product, input.token);
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: "VeilCode Studio <orders@mail.veilcode.studio>",
    replyTo: "support@veilcode.studio",
    to: input.email,
    ...message,
    subject: deployment.production ? message.subject : `[${deployment.env === "preview" ? "Preview" : "Dev"}] ${message.subject}`,
  }, {
    idempotencyKey: `delivery-${input.sessionId}-${input.tokenHash.slice(0, 16)}`,
    signal: AbortSignal.timeout(15_000),
  });
  // Never propagate provider error payloads: they may include message contents.
  if (error || !data) throw new Error("Delivery email was not accepted by Resend");
}

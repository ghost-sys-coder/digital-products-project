// Policy pages for physical stores: shipping, returns, terms, privacy and contact.
// The owner fills in a few facts; the pages are generated from them plus the store's live shipping
// rates, so what the policies say always matches what checkout charges and promises.
// These are starting templates, not legal advice: the admin says so where the owner edits them.

export const POLICIES_VERSION = 1;
export const POLICY_KINDS = ["shipping", "returns", "terms", "privacy", "contact"] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];
export const POLICY_TITLES: Record<PolicyKind, string> = {
  shipping: "Shipping policy", returns: "Returns and refunds", terms: "Terms of sale", privacy: "Privacy policy", contact: "Contact us",
};

export type StorePolicies = {
  version: typeof POLICIES_VERSION;
  /** The legal person or business that sells: named in the terms and privacy policy. */
  sellerName: string;
  /** Optional postal address for correspondence (required later for UK and EU sales). */
  sellerAddress: string;
  /** Business days to prepare an order before it ships. */
  processingDays: { min: number; max: number };
  /** Days after delivery to start a return; 0 means only damaged, faulty or wrong items. */
  returnWindowDays: number;
  returnShippingPaidBy: "customer" | "store";
  /** Business days to refund once a return arrives or a claim is approved. */
  refundDays: number;
  /** Days after the estimated delivery date to report a missing parcel. */
  lostParcelDays: number;
  responseTime: string;
  /** Where disputes are decided, for example "the State of Delaware, USA" or "England and Wales". */
  governingLaw: string;
  /** Optional paragraphs the owner adds to the end of each page. */
  extra: Partial<Record<PolicyKind, string>>;
  updatedAt: string;
};

export class PoliciesError extends Error {}

function fail(field: string, message: string): never { throw new PoliciesError(`${field}: ${message}`); }
function text(value: unknown, field: string, max: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") fail(field, "must be text");
  const clean = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
  if (clean.length > max) fail(field, `must be ${max} characters or fewer`);
  if (required && !clean) fail(field, "is required");
  return clean;
}
function whole(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) fail(field, `must be a whole number from ${min} to ${max}`);
  return value;
}

/** Validates stored or submitted policy settings. Throws PoliciesError naming the field. */
export function parseStorePolicies(value: unknown): StorePolicies {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail("policies", "must be an object");
  if (raw.version !== POLICIES_VERSION) fail("policies.version", `must be ${POLICIES_VERSION}`);
  const processing = raw.processingDays && typeof raw.processingDays === "object" ? raw.processingDays as Record<string, unknown> : {};
  const min = whole(processing.min, "processingDays.min", 0, 30);
  const max = whole(processing.max, "processingDays.max", min, 30);
  const extraRaw = raw.extra && typeof raw.extra === "object" && !Array.isArray(raw.extra) ? raw.extra as Record<string, unknown> : {};
  const extra: StorePolicies["extra"] = {};
  for (const kind of POLICY_KINDS) {
    const paragraph = text(extraRaw[kind], `extra.${kind}`, 3000);
    if (paragraph) extra[kind] = paragraph;
  }
  const updatedAt = text(raw.updatedAt, "updatedAt", 40, true);
  if (Number.isNaN(Date.parse(updatedAt))) fail("updatedAt", "must be a date");
  return {
    version: POLICIES_VERSION,
    sellerName: text(raw.sellerName, "sellerName", 120, true),
    sellerAddress: text(raw.sellerAddress, "sellerAddress", 300),
    processingDays: { min, max },
    returnWindowDays: whole(raw.returnWindowDays, "returnWindowDays", 0, 365),
    returnShippingPaidBy: raw.returnShippingPaidBy === "store" ? "store" : raw.returnShippingPaidBy === "customer" ? "customer" : fail("returnShippingPaidBy", "must be customer or store"),
    refundDays: whole(raw.refundDays, "refundDays", 1, 30),
    lostParcelDays: whole(raw.lostParcelDays, "lostParcelDays", 7, 90),
    responseTime: text(raw.responseTime, "responseTime", 80) || "within 1–2 business days",
    governingLaw: text(raw.governingLaw, "governingLaw", 120, true),
    extra, updatedAt,
  };
}

export type PolicyContext = {
  brand: string; productName: string; supportEmail: string | null; currency: string;
  rates: { name: string; amount: number; minDays: number; maxDays: number }[];
  policies: StorePolicies;
  /** The store measures its ads with a TikTok pixel (lib/tiktok.ts); the privacy policy says so. */
  adTracking?: boolean;
};
export type PolicyDocument = { title: string; intro: string; sections: { heading: string; paragraphs: string[]; table?: string[][] }[]; updatedAt: string };

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}
const days = (min: number, max: number) => min === max ? `${min} business day${min === 1 ? "" : "s"}` : `${min}–${max} business days`;

/** Builds one policy page from the store's settings. Every value is plain text, rendered as text. */
export function buildPolicy(kind: PolicyKind, ctx: PolicyContext): PolicyDocument {
  const { brand, policies: p } = ctx;
  const contact = ctx.supportEmail ? `email us at ${ctx.supportEmail}` : "contact us through this site";
  const seller = `${brand} is operated by ${p.sellerName}${p.sellerAddress ? `, ${p.sellerAddress}` : ""}.`;
  const extra = p.extra[kind] ? [{ heading: "Additional information", paragraphs: p.extra[kind]!.split(/\n\s*\n/).filter(Boolean) }] : [];
  const fastest = Math.min(...ctx.rates.map((rate) => rate.minDays));
  const slowest = Math.max(...ctx.rates.map((rate) => rate.maxDays));
  let doc: Omit<PolicyDocument, "updatedAt">;

  switch (kind) {
    case "shipping":
      doc = {
        title: POLICY_TITLES.shipping,
        intro: `We currently ship ${brand} orders to addresses in the United States.`,
        sections: [
          { heading: "Processing time", paragraphs: [`We prepare each order within ${days(p.processingDays.min, p.processingDays.max)} of payment, before it ships. Orders are not processed on weekends or public holidays.`] },
          {
            heading: "Shipping options and delivery times",
            paragraphs: [
              "You choose a shipping option at checkout. Delivery times are counted in business days from when your order ships, and are estimates rather than guarantees.",
              ctx.rates.length ? `In total, most orders arrive ${days(p.processingDays.min + fastest, p.processingDays.max + slowest)} after you order.` : "",
            ].filter(Boolean),
            table: [["Option", "Delivery time", "Cost"], ...ctx.rates.map((rate) => [rate.name, days(rate.minDays, rate.maxDays), rate.amount ? money(rate.amount, ctx.currency) : "Free"])],
          },
          { heading: "Where orders ship from", paragraphs: ["Orders are packed and shipped by our fulfilment partners, whose warehouses may be outside the United States. Shipping costs shown at checkout include everything we charge for delivery."] },
          { heading: "Tracking", paragraphs: ["As soon as your order ships we email you a tracking link. Tracking can take a day or two to show its first update."] },
          { heading: "Delays", paragraphs: ["If we can't ship your order within the time we've told you, we'll email you with a new estimate, and you can choose to cancel for a full refund instead of waiting."] },
          { heading: "Lost or damaged parcels", paragraphs: [`If your order hasn't arrived ${p.lostParcelDays} days after its estimated delivery date, or arrives damaged, ${contact} with your order reference. We'll send a replacement or a full refund.`] },
          { heading: "Address details", paragraphs: ["Please check your shipping address at checkout. If you spot a mistake, contact us straight away: we can update it until your order ships."] },
          ...extra,
        ],
      };
      break;
    case "returns": {
      const window = p.returnWindowDays;
      doc = {
        title: POLICY_TITLES.returns,
        intro: window ? `If you're not happy with your order, you can return it within ${window} days of delivery.` : "Please read this before you order: we accept returns for damaged, faulty, or incorrect items.",
        sections: [
          ...(window ? [{
            heading: "Changed your mind",
            paragraphs: [
              `You can return unused items in their original packaging within ${window} days of delivery for a refund of the item price.`,
              p.returnShippingPaidBy === "store" ? "We cover the cost of return shipping." : "The cost of sending a change-of-mind return back to us is yours, and original shipping charges are not refunded.",
            ],
          }] : []),
          { heading: "Damaged, faulty, or wrong items", paragraphs: [`If something arrives damaged, stops working, or isn't what you ordered, ${contact} within 30 days of delivery with your order reference and a photo. We'll send a replacement or a full refund, including shipping, and you won't pay to return it.`] },
          { heading: "How to start a return", paragraphs: [`Please don't send anything back before contacting us: ${contact} with your order reference and we'll reply with the return address and next steps ${p.responseTime}.`] },
          { heading: "Refunds", paragraphs: [`Once your return arrives, or your claim is approved, we refund the original payment method within ${p.refundDays} business days. Your bank may take a few more days to show it.`] },
          ...extra,
        ],
      };
      break;
    }
    case "terms":
      doc = {
        title: POLICY_TITLES.terms,
        intro: `These terms apply when you buy from ${brand}. ${seller}`,
        sections: [
          { heading: "Orders", paragraphs: ["When you place an order we email a confirmation. We may cancel an order and refund it in full, for example if an item becomes unavailable or a price was shown in error."] },
          { heading: "Prices and payment", paragraphs: [`Prices are in US dollars. Shipping is shown separately at checkout before you pay. Payments are processed securely by Stripe; we never see or store your full card details.`] },
          { heading: "Delivery", paragraphs: ["Delivery times are estimates. Our shipping policy explains processing times, shipping options, tracking, and what happens if an order is delayed or lost."] },
          { heading: "Returns", paragraphs: ["Our returns and refunds policy explains how to return an item and how refunds work. Nothing in these terms affects rights you have under consumer law."] },
          { heading: "Using the products", paragraphs: ["Please follow the instructions and safety information that come with each product."] },
          { heading: "Liability", paragraphs: [`To the extent the law allows, our liability for any order is limited to the amount you paid for it. We are not responsible for losses that were not foreseeable, or that result from misuse of a product.`] },
          { heading: "Governing law", paragraphs: [`These terms are governed by the laws of ${p.governingLaw}, without affecting any mandatory consumer protections where you live.`] },
          { heading: "Changes", paragraphs: ["We may update these terms. The version shown when you place your order applies to that order."] },
          ...extra,
        ],
      };
      break;
    case "privacy":
      doc = {
        title: POLICY_TITLES.privacy,
        intro: `This policy explains what personal information ${brand} collects when you shop, and how we use it. ${seller}`,
        sections: [
          { heading: "What we collect", paragraphs: [
            "When you order, we collect your name, email address, shipping address, phone number, and the details of what you bought. Card details are entered on Stripe's secure checkout and are never shared with us in full.",
            ...(ctx.adTracking ? ["While you browse, the TikTok pixel on this store records the pages you view, the products you look at and buy, your IP address, and details of your device and browser."] : []),
          ] },
          { heading: "How we use it", paragraphs: ["We use your information to process and deliver your order, send order confirmations and tracking updates, answer your questions, prevent fraud, and keep the records the law requires. We don't sell your personal information, and we don't send marketing emails unless you've asked for them."] },
          { heading: "Who we share it with", paragraphs: [
            "We share only what each service needs: Stripe to process your payment; our fulfilment partners and carriers, who receive your name, shipping address, and phone number to deliver your order; and the providers that host this store and send its emails.",
            ...(ctx.adTracking ? ["We also share details of your visit and purchase with TikTok, including your email address and phone number in hashed (scrambled) form, so we can measure how our TikTok ads perform and show them to people likely to be interested. Under some US state privacy laws this counts as “sharing” personal information for advertising. You can opt out at any time; see Your choices below."] : []),
          ] },
          { heading: "How long we keep it", paragraphs: ["We keep order records for as long as we need them for delivery, returns, accounting, and legal obligations, typically up to seven years, and then delete them."] },
          { heading: "Cookies", paragraphs: [ctx.adTracking
            ? "This store uses the cookies it needs to work, and the TikTok pixel's cookies to measure our ads. If you opt out, or your browser sends a Global Privacy Control signal, the TikTok pixel doesn't load."
            : "This store uses only the cookies needed for it to work. If that changes, for example to measure advertising, we'll update this policy first."] },
          { heading: "Your choices", paragraphs: [
            `You can ask us what information we hold about you, or ask us to correct or delete it, by ${ctx.supportEmail ? `emailing ${ctx.supportEmail}` : "contacting us through this site"}. We'll reply ${p.responseTime}. This store is not intended for children under 13.`,
            ...(ctx.adTracking ? ["To opt out of sharing for advertising, use “Your privacy choices” on this page or at the bottom of any page of the store. We also honour Global Privacy Control signals from your browser as an opt-out."] : []),
          ] },
          ...extra,
        ],
      };
      break;
    case "contact":
      doc = {
        title: POLICY_TITLES.contact,
        intro: ctx.supportEmail ? `Questions about an order or a product? Email us at ${ctx.supportEmail} and we'll reply ${p.responseTime}.` : `Questions about an order or a product? We'll reply ${p.responseTime}.`,
        sections: [
          { heading: "About your order", paragraphs: ["Please include your order reference, which is in your confirmation email, so we can help you quickly."] },
          { heading: "Who we are", paragraphs: [seller] },
          ...extra,
        ],
      };
      break;
  }
  return { ...doc, updatedAt: p.updatedAt };
}

/** Everything a physical store needs before it can be published and take payments. */
export function storeReadinessProblems(input: {
  pageProblems: string[]; activeVariants: number; usRates: number; supportEmail: string | null; policies: unknown;
}) {
  const problems = [...input.pageProblems];
  if (!input.activeVariants) problems.push("Add at least one active variant with a price.");
  if (!input.usRates) problems.push("Add at least one active US shipping rate.");
  if (!input.supportEmail) problems.push("Add a support email to the store brand.");
  try { parseStorePolicies(input.policies); } catch (error) {
    problems.push(`Complete the store policies (${error instanceof PoliciesError ? error.message : "invalid"}).`);
  }
  return problems;
}

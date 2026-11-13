// The studio's own legal pages (/privacy, /terms, /refunds, /data-deletion), for the digital collection and the
// site as a whole. Physical product stores publish their own policies at /s/<slug>/policies (lib/store-policies.ts).
// Starting templates written to match how the site actually works, not legal advice.

import { MAX_DOWNLOADS, TOKEN_LIFETIME_DAYS } from "./tokens";

/** Change this when the wording changes, so the pages show the right date. */
export const LEGAL_UPDATED = "2026-11-13";
/** The person or business that sells. */
export const SELLER = "VeilCode Studio";
/** Where disputes are decided. */
export const GOVERNING_LAW = "Uganda";
/** How quickly the studio answers privacy, deletion and refund requests. */
const RESPONSE = "within 2 business days";

export const LEGAL_KINDS = ["privacy", "terms", "refunds", "data-deletion"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];
export const LEGAL_TITLES: Record<LegalKind, string> = {
  privacy: "Privacy policy", terms: "Terms of sale", refunds: "Refund policy", "data-deletion": "Data deletion",
};

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] };

export function legalDocument(kind: LegalKind, support: string): LegalDocument {
  switch (kind) {
    case "privacy":
      return {
        title: LEGAL_TITLES.privacy,
        intro: `This policy explains what personal information ${SELLER} collects on this site, why, and what you can do about it. It covers the digital collection and the site as a whole. Each physical product store has its own privacy policy, linked at the bottom of that store.`,
        sections: [
          { heading: "What we collect", paragraphs: [
            "When you buy, we receive your name, email address, billing country and the details of your order. You enter card details on Stripe's secure checkout, and we never see or store them in full.",
            "When you email us, we keep the message and your email address so we can answer you.",
            "Our hosting provider keeps short-lived technical logs, such as IP address, browser type and the pages requested, to keep the site secure and working.",
          ] },
          { heading: "How we use it", paragraphs: [
            `We use your information to take payment, email your download link (it works for ${TOKEN_LIFETIME_DAYS} days and up to ${MAX_DOWNLOADS} downloads), answer your questions, handle refunds, prevent fraud, and keep the records the law requires.`,
            "We don't sell your personal information, and we don't send marketing emails unless you've asked for them.",
          ] },
          { heading: "Who we share it with", paragraphs: [
            "We share only what each service needs to do its job: Stripe processes payments, Resend sends our emails, Supabase stores orders and product files, and Vercel hosts the site. Each one handles your data under its own privacy terms and only on our instructions.",
            "We use Meta's Ad Library to research products. That tool reads public advertising data only. It doesn't receive anything about you, and this site has no Facebook login for visitors.",
          ] },
          { heading: "Cookies", paragraphs: [
            "The pages of the digital collection don't use advertising or analytics cookies. The only cookie we set keeps the studio owner signed in to the admin area. If that changes, we'll update this policy first.",
          ] },
          { heading: "How long we keep it", paragraphs: [
            "We keep order records for as long as we need them for delivery, refunds, accounting and legal obligations, typically up to seven years, and then delete them. Download links stop working after they expire.",
          ] },
          { heading: "Your rights", paragraphs: [
            `You can ask what information we hold about you, or ask us to correct or delete it, by emailing ${support}. We'll reply ${RESPONSE}. Depending on where you live, you may also be able to complain to your local data protection authority.`,
            "Our services and providers may process your information outside your country, including in the United States. This site is not intended for children under 13.",
          ] },
          { heading: "Changes", paragraphs: ["If we change this policy, we'll update the date at the top of this page. Significant changes will apply only to information collected after the change."] },
          { heading: "Contact", paragraphs: [`Questions about privacy: ${support}.`] },
        ],
      };
    case "terms":
      return {
        title: LEGAL_TITLES.terms,
        intro: `These terms apply when you use this site or buy a digital product from ${SELLER}. Purchases from a physical product store follow that store's own terms of sale.`,
        sections: [
          { heading: "What you're buying", paragraphs: [
            `Our products are digital files: guides, templates and toolkits. After payment, we email a download link to the address you gave at checkout. The link works for ${TOKEN_LIFETIME_DAYS} days and up to ${MAX_DOWNLOADS} downloads. If it runs out or the email doesn't arrive, write to us and we'll send a new one.`,
          ] },
          { heading: "Prices and payment", paragraphs: [
            "Prices are shown on each product page and charged once; there are no subscriptions. Stripe processes the payment, and any taxes are shown at checkout. A purchase is complete when payment succeeds.",
          ] },
          { heading: "Your licence", paragraphs: [
            "You get a personal, non-transferable licence to use the files in your own work and in work you do for your clients or employer. You may edit the templates as much as you like.",
            "You may not resell, share, sublicense, or publish the files, or edited versions of them, as products of your own, or make them freely available to others.",
          ] },
          { heading: "Refunds", paragraphs: ["Our refund policy explains when we refund a purchase. Nothing in these terms affects rights you have under consumer law where you live."] },
          { heading: "Using the site", paragraphs: ["Please don't misuse the site: no attempts to break its security, scrape it in bulk, or interfere with other people's use of it."] },
          { heading: "Our responsibility", paragraphs: [
            "We take care to make our products accurate and useful, but they're guidance, not professional advice for your particular situation. As far as the law allows, our total liability for any purchase is limited to the amount you paid for it. We don't exclude liability that the law doesn't allow us to exclude.",
          ] },
          { heading: "Governing law", paragraphs: [`These terms are governed by the laws of ${GOVERNING_LAW}, without affecting any mandatory consumer protections where you live.`] },
          { heading: "Changes", paragraphs: ["We may update these terms. The version shown when you buy applies to that purchase."] },
          { heading: "Contact", paragraphs: [`${SELLER}: ${support}.`] },
        ],
      };
    case "refunds":
      return {
        title: LEGAL_TITLES.refunds,
        intro: "Our products are delivered instantly, so we can't take them back. If something isn't right, we'll fix it or refund you.",
        sections: [
          { heading: "When we refund", paragraphs: [
            "Within 14 days of buying, we'll refund you in full if the file is faulty or won't open, the product is clearly not as described, you can't download it and we can't fix that, or you were charged twice for the same product.",
          ] },
          { heading: "When we usually don't", paragraphs: [
            "Because you keep the files, we don't usually refund a purchase you've downloaded just because you changed your mind. If you're unhappy for another reason, write to us anyway: we read every message and will be fair.",
          ] },
          { heading: "How to ask", paragraphs: [
            `Email ${support} from the address you used at checkout, with the product name and a short note on what went wrong. We'll reply ${RESPONSE}.`,
          ] },
          { heading: "How refunds are paid", paragraphs: [
            "Approved refunds go back to the card or payment method you used, through Stripe. They usually appear within 5 to 10 business days, depending on your bank.",
          ] },
          { heading: "Your legal rights", paragraphs: ["Nothing in this policy limits any rights you have under consumer law where you live."] },
        ],
      };
    case "data-deletion":
      return {
        title: LEGAL_TITLES["data-deletion"],
        intro: `You can ask ${SELLER} to delete the personal information we hold about you at any time.`,
        sections: [
          { heading: "How to ask", paragraphs: [
            `Email ${support} with the subject “Delete my data”, from the email address you used to buy or contact us. We may ask you to confirm the request from that address so no one else can delete your information.`,
          ] },
          { heading: "What we delete", paragraphs: [
            "We delete your contact details, your messages to us, and any active download links. We confirm by email once it's done, usually within 30 days.",
            "We may keep a minimal record of a payment where tax or accounting law requires it, and only for as long as it requires. Stripe keeps its own payment records under its privacy policy.",
          ] },
          { heading: "Facebook and Meta", paragraphs: [
            "This site has no Facebook login for visitors, and we don't receive personal information about you from Facebook or Meta. We use Meta's tools only to read public advertising data for product research. If you think we hold anything about you from Meta, email us and we'll check and delete it.",
          ] },
        ],
      };
  }
}

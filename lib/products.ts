import "server-only";
import type { DeliveryProduct } from "./catalog.types";

export const PRODUCTS = {
  "lead-to-kickoff": {
    name: "Lead to Kickoff: The Client Onboarding System",
    emailSubject: "Your Lead to Kickoff kit is ready",
    shortName: "Lead to Kickoff",
    get stripePaymentLinkId() { return process.env.STRIPE_PAYMENT_LINK_ID_L2K; },
    storagePath: "lead-to-kickoff/lead-to-kickoff.pdf",
    downloadFilename: "Lead-to-Kickoff.pdf",
    get templatesUrl() { return process.env.L2K_TEMPLATES_URL ?? null; },
  },
} as const;

export type Product = DeliveryProduct;

export function getProduct(id: string): Product | undefined {
  return Object.hasOwn(PRODUCTS, id) ? PRODUCTS[id as keyof typeof PRODUCTS] : undefined;
}

export function findProductByPaymentLink(id: string | null) {
  return Object.entries(PRODUCTS).find(([, product]) => product.stripePaymentLinkId === id);
}

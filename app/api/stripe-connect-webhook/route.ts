import { handleStripeWebhook } from "@/lib/stripe-webhook";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) { return handleStripeWebhook(req, true); }

import "server-only";
import Stripe from "stripe";
import { getEnv } from "./env";

let client: Stripe | undefined;

export function getStripe() {
  const env = getEnv();
  return client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-09-30.endive",
    maxNetworkRetries: 2,
    timeout: 15_000,
  });
}

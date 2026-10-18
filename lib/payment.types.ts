export type PaymentProvider = "stripe" | "paypal";
export type PaymentConnection = {
  id: string; store_id: string; provider: PaymentProvider; external_account_id: string;
  livemode: boolean; is_current: boolean; status: "connected" | "restricted" | "disconnected";
  charges_enabled: boolean; payouts_enabled: boolean; country: string | null;
  requirements: string[]; created_at: string; updated_at: string;
};
export type PaymentOAuthAttempt = {
  state_hash: string; store_id: string; owner_user_id: string; livemode: boolean;
  expires_at: string; consumed_at: string | null; created_at?: string;
};
export type ProductPaymentRef = {
  store_id: string; connection_id: string; product_id: string;
  external_product_id: string; external_price_id: string; amount: number; currency: string;
};
export type StripePaymentContext = {
  provider: "stripe"; storeId: string; livemode: boolean;
  connectionId: string | null; accountId: string | null;
};

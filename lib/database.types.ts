import type { CatalogProduct, Checkout, Store, DeliveryProduct } from "./catalog.types";
import type { PaymentConnection, PaymentOAuthAttempt, ProductPaymentRef } from "./payment.types";
// Mirrors the migrations. Keep these types with the schema.
export type Order = {
  id: string;
  stripe_session_id: string;
  product_id: string;
  email: string;
  amount_total: number | null;
  currency: string | null;
  download_token_hash: string;
  download_count: number;
  max_downloads: number;
  token_expires_at: string;
  email_status: "pending" | "sent";
  email_sent_at: string | null;
  created_at: string;
  delivery_lock_id: string | null;
  delivery_locked_until: string | null;
  store_id: string;
  product_snapshot: DeliveryProduct | null;
  payment_connection_id?: string | null;
};

export type Database = {
  public: {
    Tables: {
      payment_connections: { Row: PaymentConnection; Insert: Partial<PaymentConnection> & Pick<PaymentConnection, "store_id" | "provider" | "external_account_id" | "livemode" | "status">; Update: Partial<PaymentConnection>; Relationships: [] };
      payment_oauth_attempts: { Row: PaymentOAuthAttempt; Insert: PaymentOAuthAttempt; Update: Partial<PaymentOAuthAttempt>; Relationships: [] };
      product_payment_refs: { Row: ProductPaymentRef; Insert: ProductPaymentRef; Update: Partial<ProductPaymentRef>; Relationships: [] };
      stores: { Row: Store; Insert: Store; Update: Partial<Store>; Relationships: [] };
      products: { Row: CatalogProduct; Insert: Pick<CatalogProduct, "id" | "store_id" | "slug" | "name"> & Partial<CatalogProduct>; Update: Partial<CatalogProduct>; Relationships: [] };
      checkouts: { Row: Checkout; Insert: Omit<Checkout, "created_at"> & { created_at?: string }; Update: Partial<Checkout>; Relationships: [] };
      orders: {
        Row: Order;
        Insert: Pick<Order, "stripe_session_id" | "product_id" | "email" | "download_token_hash" | "token_expires_at"> & Partial<Order>;
        Update: Partial<Order>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      activate_payment_connection: {
        Args: { p_store_id: string; p_owner_id: string; p_account_id: string; p_livemode: boolean; p_charges_enabled: boolean; p_payouts_enabled: boolean; p_country: string; p_requirements: string[] };
        Returns: string;
      };
      consume_download: {
        Args: { p_token_hash: string };
        Returns: { product_id: string; product_snapshot: DeliveryProduct | null }[];
      };
      claim_delivery: {
        Args: { p_session_id: string; p_lock_id: string; p_force?: boolean };
        Returns: Order[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

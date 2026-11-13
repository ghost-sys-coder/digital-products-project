import type { CatalogProduct, Checkout, Store, DeliveryProduct, PhysicalSnapshot, ShippingAddress } from "./catalog.types";
import type { PaymentConnection, PaymentOAuthAttempt, ProductPaymentRef } from "./payment.types";
import type { RateInput, VariantInput } from "./store-input";
import type { ResearchProduct } from "./research.types";
// Mirrors the migrations. Keep these types with the schema.
export type McpScope = "read" | "research" | "build";
export type McpClient = { client_id: string; name: string; redirect_uris: string[]; secret_hash: string | null; created_at: string };
export type McpConnection = {
  id: string; store_id: string; kind: "oauth" | "token"; name: string; client_id: string | null; scopes: McpScope[];
  created_at: string; last_used_at: string | null; revoked_at: string | null;
};
export type McpSecret = {
  hash: string; kind: "code" | "access" | "refresh" | "personal"; connection_id: string;
  details: Record<string, unknown>; expires_at: string | null; used_at: string | null; created_at: string;
};
export type McpActivity = { id: number; connection_id: string; tool: string; summary: string; ok: boolean; created_at: string };
export type McpUpload = { id: string; connection_id: string; product_id: string; filename: string; size: number; parts: string[]; received: number; created_at: string };
export type IntegrationToken = { provider: "cj"; access_token: string; expires_at: string; updated_at: string };
export type Order = {
  id: string;
  stripe_session_id: string;
  product_id: string;
  email: string;
  amount_total: number | null;
  currency: string | null;
  /** Null for physical orders, which have no download. */
  download_token_hash: string | null;
  download_count: number;
  max_downloads: number;
  token_expires_at: string | null;
  email_status: "pending" | "sent";
  email_sent_at: string | null;
  created_at: string;
  delivery_lock_id: string | null;
  delivery_locked_until: string | null;
  store_id: string;
  product_snapshot: DeliveryProduct | null;
  payment_connection_id?: string | null;
  // Physical orders (supabase/migrations/20261112140000_physical_products.sql).
  kind?: "digital" | "physical";
  customer_name?: string | null;
  shipping_address?: ShippingAddress | null;
  physical_snapshot?: PhysicalSnapshot | null;
  fulfillment_status?: FulfillmentStatus | null;
  supplier_order_ref?: string | null;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  tracking_url?: string | null;
  ordered_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  tracking_email_sent_at?: string | null;
  // Delays and cancellations (supabase/migrations/20261113120000_order_delays.sql).
  delay_notices?: DelayNotice[];
  cancel_token_hash?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: "owner" | "customer" | null;
  refund_id?: string | null;
  refunded_amount?: number | null;
};
export type DelayNotice = { sentAt: string; shipBy: string; reason: string };
export type FulfillmentStatus = "needs_ordering" | "ordered" | "shipped" | "delivered" | "cancelled";

export type Database = {
  public: {
    Tables: {
      payment_connections: { Row: PaymentConnection; Insert: Partial<PaymentConnection> & Pick<PaymentConnection, "store_id" | "provider" | "external_account_id" | "livemode" | "status">; Update: Partial<PaymentConnection>; Relationships: [] };
      payment_oauth_attempts: { Row: PaymentOAuthAttempt; Insert: PaymentOAuthAttempt; Update: Partial<PaymentOAuthAttempt>; Relationships: [] };
      product_payment_refs: { Row: ProductPaymentRef; Insert: ProductPaymentRef; Update: Partial<ProductPaymentRef>; Relationships: [] };
      research_products: {
        Row: ResearchProduct & { store_id: string };
        Insert: Pick<ResearchProduct, "title"> & Partial<ResearchProduct> & { store_id: string };
        Update: Partial<ResearchProduct>;
        Relationships: [];
      };
      mcp_clients: { Row: McpClient; Insert: Omit<McpClient, "created_at" | "secret_hash"> & { secret_hash?: string | null }; Update: Partial<McpClient>; Relationships: [] };
      mcp_connections: { Row: McpConnection; Insert: Pick<McpConnection, "store_id" | "kind" | "name" | "scopes"> & Partial<McpConnection>; Update: Partial<McpConnection>; Relationships: [] };
      mcp_secrets: { Row: McpSecret; Insert: Pick<McpSecret, "hash" | "kind" | "connection_id"> & Partial<McpSecret>; Update: Partial<McpSecret>; Relationships: [] };
      mcp_activity: { Row: McpActivity; Insert: Pick<McpActivity, "connection_id" | "tool" | "summary" | "ok">; Update: Partial<McpActivity>; Relationships: [] };
      mcp_uploads: { Row: McpUpload; Insert: Pick<McpUpload, "connection_id" | "product_id" | "filename" | "size"> & Partial<McpUpload>; Update: Partial<McpUpload>; Relationships: [] };
      integration_tokens: { Row: IntegrationToken; Insert: Omit<IntegrationToken, "updated_at"> & { updated_at?: string }; Update: Partial<IntegrationToken>; Relationships: [] };
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
      // supabase/migrations/20261113090000_store_editor.sql
      save_shipping_profile: {
        Args: { p_store_id: string; p_profile_id: string; p_name: string; p_rates: RateInput[] };
        Returns: string;
      };
      save_physical_store: {
        Args: { p_store_id: string; p_product_id: string; p_revision: number; p_product: Record<string, unknown>; p_variants: VariantInput[] };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

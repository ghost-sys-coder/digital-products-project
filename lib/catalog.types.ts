import type { Currency } from "./store-config";

export type DeliveryProduct = {
  name: string; shortName: string; emailSubject: string;
  storagePath: string; downloadFilename: string; templatesUrl: string | null;
};
export type Store = {
  id: string; owner_user_id: string | null; name: string; tagline: string;
  bio: string; support_email: string; website_url: string | null;
};
export type CatalogProduct = {
  id: string; store_id: string; slug: string; name: string; tagline: string;
  description: string; includes: string[]; status: "draft" | "published";
  stripe_product_id: string | null; stripe_price_id: string | null;
  price_amount: number | null; currency: Currency; stripe_livemode: boolean | null;
  storage_path: string | null; download_filename: string | null;
  templates_url: string | null; cover_path: string | null; cover_type: string | null;
  sort_order: number; revision: number; created_at: string; updated_at: string;
};
export type Checkout = {
  id: string; store_id: string; product_id: string; stripe_session_id: string | null;
  stripe_price_id: string; amount: number; currency: string;
  product_slug: string;
  product_snapshot: DeliveryProduct; created_at: string;
};

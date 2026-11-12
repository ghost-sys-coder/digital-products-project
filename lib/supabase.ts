import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

// Each environment has its own Supabase project; getEnv() refuses to start if preview
// points at production's project (lib/deployment-rules.ts).
export function getSupabase() {
  const env = getEnv();
  return client ??= createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

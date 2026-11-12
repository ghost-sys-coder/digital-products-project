import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getEnv, ConfigurationError } from "./env";
import { HttpError } from "./http";

export const OWNER_COOKIE = "veilcode_owner";
export function getOwnerId() {
  const id = process.env.OWNER_USER_ID;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new ConfigurationError("OWNER_USER_ID", "must be your Supabase Auth user's UUID");
  return id;
}
// Auth clients are request-scoped: signing in must never mutate a shared session.
// Password sign-in and token verification need only the public key, never a data key.
export function authClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function ownerUser() {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await authClient().auth.getUser(token);
  return !error && data.user?.id === getOwnerId() ? data.user : null;
}
export async function requireOwner() {
  const user = await ownerUser();
  if (!user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  return user;
}
export async function ownerPage() {
  const user = await ownerUser();
  if (!user) redirect("/admin/login");
  return user;
}

import "server-only";
import { getSupabase } from "./supabase";
import { getEnv } from "./env";
import { HttpError } from "./http";

export type DownloadAvailability = "available" | "missing" | "unverified";

export async function getDownloadAvailability(storagePath: string | null): Promise<DownloadAvailability> {
  if (!storagePath) return "missing";
  try {
    const { data, error } = await getSupabase().storage.from(getEnv().SUPABASE_BUCKET).exists(storagePath);
    // Missing objects return data:false AND an error in the installed SDK.
    if (data === false) return "missing";
    return data === true && !error ? "available" : "unverified";
  } catch {
    return "unverified";
  }
}

export async function assertDownloadAvailable(storagePath: string | null, missingMessage: string) {
  const availability = await getDownloadAvailability(storagePath);
  if (availability === "missing") throw new HttpError(503, missingMessage);
  if (availability !== "available") throw new HttpError(503, "Could not verify the downloadable file. Please try again.");
}

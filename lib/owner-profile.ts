import type { User } from "@supabase/supabase-js";

export type OwnerProfile = { name: string; email: string | null; initials: string };

// Only display fields cross the client boundary; tokens and auth metadata stay server-side.
export function ownerProfile(user?: Pick<User, "email" | "user_metadata">): OwnerProfile {
  const metadata = user?.user_metadata ?? {};
  const savedName = [metadata.full_name, metadata.display_name, metadata.name]
    .find((value): value is string => typeof value === "string" && !!value.trim());
  const email = user?.email ?? null;
  const emailName = email?.split("@")[0].replace(/[._+-]+/g, " ").trim();
  const name = savedName?.trim() || emailName || "Store owner";
  const words = name.split(/\s+/u);
  const initials = [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])]
    .map((word) => Array.from(word)[0]).join("").toLocaleUpperCase();
  return { name, email, initials };
}

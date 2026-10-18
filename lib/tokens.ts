import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const MAX_DOWNLOADS = 5;
export const TOKEN_LIFETIME_DAYS = 14;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function issueToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_DAYS * 86400_000).toISOString(),
  };
}

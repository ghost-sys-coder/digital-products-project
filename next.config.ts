import type { NextConfig } from "next";

// Store images come only from this environment's own public storefront bucket.
function storefrontImages(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  try {
    const url = new URL(process.env.SUPABASE_URL ?? "");
    if (url.protocol !== "https:") return [];
    return [{ protocol: "https", hostname: url.hostname, port: "", pathname: "/storage/v1/object/public/storefront/**", search: "" }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: { remotePatterns: storefrontImages(), formats: ["image/avif", "image/webp"] },
  // The homepage checks which lifestyle photos exist and the photo route serves them (lib/home-photos.ts),
  // so both ship with the files.
  outputFileTracingIncludes: { "/": ["./public/home/**/*"], "/api/home-photo/**": ["./public/home/**/*"] },
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

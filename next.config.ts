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

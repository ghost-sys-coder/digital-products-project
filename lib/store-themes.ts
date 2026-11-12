// Theme presets and per-store brand settings for single-product stores.
// A theme is a set of design tokens applied as CSS variables; fonts are loaded in
// app/s/[slug]/fonts.ts. Stores pick a preset and may override the accent colour and logo.

export const THEMES = ["clean-minimal", "bold-dark", "soft-luxe", "vibrant-pop"] as const;
export type ThemeId = (typeof THEMES)[number];

export type ThemeTokens = {
  label: string; description: string; dark: boolean;
  bg: string; surface: string; surfaceAlt: string; text: string; muted: string; border: string;
  accent: string; radius: string; buttonRadius: string; headingFont: "inter" | "space" | "fraunces" | "bricolage";
  bodyFont: "inter" | "manrope" | "jakarta"; headingWeight: number; headingTracking: string; headingCase: "none" | "uppercase";
};

export const THEME_TOKENS: Record<ThemeId, ThemeTokens> = {
  "clean-minimal": {
    label: "Clean Minimal", description: "Crisp white space and precise type. Suits tech and gadgets.", dark: false,
    bg: "#ffffff", surface: "#f5f5f7", surfaceAlt: "#ebebef", text: "#111114", muted: "#5e6068", border: "#e3e3e8",
    accent: "#111114", radius: "18px", buttonRadius: "999px", headingFont: "inter", bodyFont: "inter",
    headingWeight: 650, headingTracking: "-0.035em", headingCase: "none",
  },
  "bold-dark": {
    label: "Bold Dark", description: "Deep blacks, glowing accents, high contrast. Suits projectors, fitness, and gaming.", dark: true,
    bg: "#07080c", surface: "#11131a", surfaceAlt: "#1a1d27", text: "#f4f5fa", muted: "#a2a6b8", border: "#262a37",
    accent: "#6c47ff", radius: "14px", buttonRadius: "12px", headingFont: "space", bodyFont: "manrope",
    headingWeight: 700, headingTracking: "-0.03em", headingCase: "none",
  },
  "soft-luxe": {
    label: "Soft Luxe", description: "Warm neutrals and elegant serif headings. Suits beauty, skincare, and clothing.", dark: false,
    bg: "#fbf8f4", surface: "#f3ede5", surfaceAlt: "#ebe2d6", text: "#2a2420", muted: "#7a6e63", border: "#e6dccf",
    accent: "#8a5a44", radius: "4px", buttonRadius: "2px", headingFont: "fraunces", bodyFont: "jakarta",
    headingWeight: 500, headingTracking: "-0.02em", headingCase: "none",
  },
  "vibrant-pop": {
    label: "Vibrant Pop", description: "Bright colour and playful shapes for viral, impulse-buy products.", dark: false,
    bg: "#fffdf6", surface: "#fff1d6", surfaceAlt: "#ffe3ec", text: "#1b1530", muted: "#5d5577", border: "#1b1530",
    accent: "#ff3d7f", radius: "22px", buttonRadius: "999px", headingFont: "bricolage", bodyFont: "jakarta",
    headingWeight: 800, headingTracking: "-0.04em", headingCase: "none",
  },
};

export type Brand = {
  name: string; logoPath: string | null; accent: string | null; supportEmail: string | null;
  /** TikTok pixel for ads measurement; see lib/tiktok.ts. */
  tiktokPixelId: string | null;
};

export class BrandError extends Error {}

/** Validates brand settings. Logo must be in this product's storefront folder. */
export function parseBrand(value: unknown, storeId: string, productId: string): Brand {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length > 40) throw new BrandError("Brand name must be 40 characters or fewer.");
  const logoPath = typeof raw.logoPath === "string" && raw.logoPath ? raw.logoPath : null;
  if (logoPath && (!logoPath.startsWith(`${storeId}/${productId}/`) || !/^[A-Za-z0-9/_.-]+$/.test(logoPath) || logoPath.includes(".."))) {
    throw new BrandError("The logo must be uploaded to this store.");
  }
  const accent = typeof raw.accent === "string" && raw.accent ? raw.accent.toLowerCase() : null;
  if (accent && !/^#[0-9a-f]{6}$/.test(accent)) throw new BrandError("Accent colour must be a hex colour like #7c5cff.");
  const supportEmail = typeof raw.supportEmail === "string" && raw.supportEmail.trim() ? raw.supportEmail.trim() : null;
  if (supportEmail && (supportEmail.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail))) throw new BrandError("Enter a valid brand support email.");
  const tiktokPixelId = typeof raw.tiktokPixelId === "string" && raw.tiktokPixelId.trim() ? raw.tiktokPixelId.trim().toUpperCase() : null;
  if (tiktokPixelId && !/^[A-Z0-9]{10,32}$/.test(tiktokPixelId)) throw new BrandError("The TikTok pixel ID is the code of letters and numbers shown in TikTok Events Manager, like C4ABCD1234EFGH5678IJ.");
  return { name, logoPath, accent, supportEmail, tiktokPixelId };
}

/** Card statements show the account prefix plus this suffix; keep it short and plain. */
export function statementSuffix(brandName: string) {
  const clean = brandName.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 10).trim();
  return /[A-Z]/.test(clean) ? clean : null;
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Black or white, whichever reads better on the accent (WCAG contrast). */
export function onAccent(accent: string) {
  const l = luminance(accent);
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#0b0b0f";
}

/** CSS variables for a store's wrapper element. */
export function themeVariables(theme: ThemeId, brand: Pick<Brand, "accent">): Record<string, string> {
  const tokens = THEME_TOKENS[theme];
  const accent = brand.accent ?? tokens.accent;
  return {
    "--st-bg": tokens.bg, "--st-surface": tokens.surface, "--st-surface-alt": tokens.surfaceAlt,
    "--st-text": tokens.text, "--st-muted": tokens.muted, "--st-border": tokens.border,
    "--st-accent": accent, "--st-on-accent": onAccent(accent),
    "--st-radius": tokens.radius, "--st-button-radius": tokens.buttonRadius,
    "--st-heading-weight": String(tokens.headingWeight), "--st-heading-tracking": tokens.headingTracking,
    "--st-heading-font": `var(--font-${tokens.headingFont})`, "--st-body-font": `var(--font-${tokens.bodyFont})`,
  };
}

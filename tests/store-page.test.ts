import { describe, expect, it } from "vitest";
import { parseStorePage, starterStorePage, storePageReadiness, StorePageError } from "../lib/store-page";
import { onAccent, parseBrand, themeVariables, THEMES, THEME_TOKENS, BrandError } from "../lib/store-themes";

const STORE = "c9fdc8a4-3d95-4d43-97f2-b650386179d2";
const PRODUCT = "0b5e3c3e-6f4a-4f63-9a3c-1f0d3a1e2b77";
const prefix = `${STORE}/${PRODUCT}/`;
const page = (sections: unknown[]) => ({ version: 1, sections });
const hero = (data: Record<string, unknown> = {}) => ({ id: "hero", type: "hero", enabled: true, data: { headline: "Glow", media: [{ path: `${prefix}media/a.webp`, kind: "image", alt: "Lamp" }], ...data } });

describe("store page validation", () => {
  it("accepts the starter page and keeps sections in order", () => {
    const parsed = parseStorePage(starterStorePage(), STORE, PRODUCT);
    expect(parsed.sections.map((section) => section.type)).toEqual(starterStorePage().sections.map((section) => section.type));
  });

  it("keeps text as plain text, strips control characters, and drops unknown fields", () => {
    const parsed = parseStorePage(page([hero({ headline: "  <b>Glow</b>\u0007 ", onclick: "alert(1)" })]), STORE, PRODUCT);
    const data = parsed.sections[0].data as Record<string, unknown>;
    expect(data.headline).toBe("<b>Glow</b>");
    expect(data).not.toHaveProperty("onclick");
  });

  it("refuses media outside this product's storefront folder", () => {
    for (const path of [`${STORE}/another-product/media/a.webp`, `${prefix}../../secret.pdf`, "https://evil.example/a.png", `${prefix}media/a b.png`]) {
      expect(() => parseStorePage(page([hero({ media: [{ path, kind: "image", alt: "" }] })]), STORE, PRODUCT)).toThrow(StorePageError);
    }
  });

  it("enforces lengths, list sizes, known types, unique ids, and single sections", () => {
    expect(() => parseStorePage(page([hero({ headline: "x".repeat(121) })]), STORE, PRODUCT)).toThrow(/120 characters/);
    expect(() => parseStorePage(page([hero({ badges: ["a", "b", "c", "d", "e"] })]), STORE, PRODUCT)).toThrow(/at most 4/);
    expect(() => parseStorePage(page([{ id: "x", type: "script", data: {} }]), STORE, PRODUCT)).toThrow(/not a known section/);
    expect(() => parseStorePage(page([hero(), { ...hero(), id: "hero" }]), STORE, PRODUCT)).toThrow(/unique/);
    expect(() => parseStorePage(page([hero(), { ...hero(), id: "hero-2" }]), STORE, PRODUCT)).toThrow(/only appear once/);
    expect(() => parseStorePage({ version: 2, sections: [] }, STORE, PRODUCT)).toThrow(/version/);
  });

  it("only allows videos in the video strip and known icons in benefits", () => {
    expect(() => parseStorePage(page([{ id: "v", type: "video_strip", data: { videos: [{ media: { path: `${prefix}media/a.webp`, kind: "image" } }] } }]), STORE, PRODUCT)).toThrow(/must be video/);
    const parsed = parseStorePage(page([{ id: "b", type: "benefits", data: { items: [{ icon: "<script>", title: "Bright" }] } }]), STORE, PRODUCT);
    expect((parsed.sections[0].data as { items: { icon: string }[] }).items[0].icon).toBe("check");
  });

  it("requires size guide rows to match the columns", () => {
    expect(() => parseStorePage(page([{ id: "s", type: "size_guide", data: { columns: ["Size", "Chest"], rows: [["M"]] } }]), STORE, PRODUCT)).toThrow(/one value per column/);
  });

  it("reports what is missing before publishing", () => {
    expect(storePageReadiness(parseStorePage(page([]), STORE, PRODUCT))).toContain("Add and enable the Hero and buy box section.");
    expect(storePageReadiness(parseStorePage(page([hero({ media: [] })]), STORE, PRODUCT))).toContain("Add at least one product image to the hero gallery.");
    expect(storePageReadiness(parseStorePage(page([hero()]), STORE, PRODUCT))).toEqual([]);
  });
});

describe("themes and brand", () => {
  it("defines every preset with an accent that has readable button text", () => {
    for (const theme of THEMES) {
      const vars = themeVariables(theme, { accent: null });
      expect(vars["--st-accent"]).toBe(THEME_TOKENS[theme].accent);
      expect(["#ffffff", "#0b0b0f"]).toContain(vars["--st-on-accent"]);
    }
    expect(onAccent("#ffe600")).toBe("#0b0b0f");
    expect(onAccent("#1b1530")).toBe("#ffffff");
  });

  it("validates brand settings", () => {
    expect(parseBrand({ name: " Nova Glow ", accent: "#7C5CFF", logoPath: `${prefix}brand/logo.png` }, STORE, PRODUCT))
      .toEqual({ name: "Nova Glow", accent: "#7c5cff", logoPath: `${prefix}brand/logo.png`, supportEmail: null });
    expect(() => parseBrand({ accent: "red" }, STORE, PRODUCT)).toThrow(BrandError);
    expect(() => parseBrand({ logoPath: "https://evil.example/logo.png" }, STORE, PRODUCT)).toThrow(BrandError);
    expect(() => parseBrand({ supportEmail: "nope" }, STORE, PRODUCT)).toThrow(BrandError);
  });
});

describe("showcase, banner, and statement sections", () => {
  it("fills safe defaults and refuses videos where only images fit", () => {
    const parsed = parseStorePage(page([{ id: "s", type: "showcase", data: { headline: "Glow up", layout: "sideways", tone: "neon" } }]), STORE, PRODUCT);
    expect(parsed.sections[0].data).toMatchObject({ layout: "split", tone: "soft", media: null, watermark: "", buttonLabel: "" });
    expect(() => parseStorePage(page([{ id: "s", type: "showcase", data: { headline: "x", media: { path: `${prefix}media/a.mp4`, kind: "video" } } }]), STORE, PRODUCT)).toThrow(/must be image/);
    expect(() => parseStorePage(page([{ id: "s", type: "showcase", data: {} }]), STORE, PRODUCT)).toThrow(/headline: is required/);
  });

  it("validates benefit layouts, feature eyebrows, banners, and statements", () => {
    const parsed = parseStorePage(page([
      { id: "b", type: "benefits", data: { layout: "spotlight", media: { path: `${prefix}media/c.webp`, kind: "image" }, items: [{ icon: "moon", title: "Calm" }] } },
      { id: "f", type: "features", data: { items: [{ eyebrow: "The effect", title: "Moves" }] } },
      { id: "i", type: "image_banner", data: { media: { path: `${prefix}media/b.mp4`, kind: "video" }, headline: "Cosmic" } },
      { id: "q", type: "statement", data: { quote: "Stars, at home." } },
    ]), STORE, PRODUCT);
    expect(parsed.sections.map((section) => section.data)).toMatchObject([
      { layout: "spotlight", media: { kind: "image" } }, { items: [{ eyebrow: "The effect" }] },
      { media: { kind: "video" }, buttonLabel: "" }, { quote: "Stars, at home.", tone: "accent", attribution: "" },
    ]);
    expect(() => parseStorePage(page([{ id: "q", type: "statement", data: { quote: "" } }]), STORE, PRODUCT)).toThrow(/quote: is required/);
    expect(() => parseStorePage(page([{ id: "f", type: "features", data: { items: [{ eyebrow: "x".repeat(41), title: "t" }] } }]), STORE, PRODUCT)).toThrow(/40 characters/);
  });
});

describe("bento and masonry grids", () => {
  it("normalises tile sizes, tones and icons, and keeps the layout", () => {
    const parsed = parseStorePage(page([{ id: "g", type: "bento", data: { title: "Details", layout: "masonry", tiles: [
      { size: "huge", tone: "loud", icon: "<svg>", title: "12 colours" },
      { size: "large", media: { path: `${prefix}media/a.webp`, kind: "image", alt: "Room" } },
    ] } }]), STORE, PRODUCT);
    expect(parsed.sections[0].data).toMatchObject({ layout: "masonry", tiles: [
      { size: "small", tone: "soft", icon: null, title: "12 colours", media: null },
      { size: "large", media: { kind: "image" }, title: "" },
    ] });
  });

  it("refuses empty tiles, too many tiles, and media from elsewhere", () => {
    expect(() => parseStorePage(page([{ id: "g", type: "bento", data: { tiles: [{ size: "small" }] } }]), STORE, PRODUCT)).toThrow(/needs an image or a title/);
    expect(() => parseStorePage(page([{ id: "g", type: "bento", data: { tiles: Array.from({ length: 13 }, () => ({ title: "x" })) } }]), STORE, PRODUCT)).toThrow(/at most 12/);
    expect(() => parseStorePage(page([{ id: "g", type: "bento", data: { tiles: [{ media: { path: "elsewhere/a.webp", kind: "image" } }] } }]), STORE, PRODUCT)).toThrow(/not a file from this store/);
  });
});

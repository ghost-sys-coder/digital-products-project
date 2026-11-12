// Section-based store pages for physical products (docs/physical-products-plan.md).
// The page is stored as JSON on the product. It is ALWAYS parsed with parseStorePage before
// saving or rendering: unknown fields are dropped, every string is length-limited plain text
// (rendered as text, never HTML), and media must live in this product's storefront folder.

export const STORE_PAGE_VERSION = 1;

export const ICONS = [
  "sparkles", "zap", "shield-check", "truck", "heart", "star", "leaf", "droplet", "sun", "moon",
  "battery", "wifi", "smartphone", "dumbbell", "timer", "flame", "gem", "gift", "clock", "check",
  "thumbs-up", "award", "recycle", "feather", "palette", "music", "eye", "smile", "lock", "rotate-ccw",
] as const;
export type IconName = (typeof ICONS)[number];

export type Media = { path: string; kind: "image" | "video"; alt: string };
/** Background treatment: the page colour, the theme's soft surface, or a wash of the brand accent. */
export type Tone = "plain" | "soft" | "accent";

type SectionData = {
  announcement: { text: string };
  hero: { headline: string; subheadline: string; media: Media[]; highlights: string[]; badges: string[] };
  showcase: { eyebrow: string; headline: string; text: string; media: Media | null; layout: "split" | "centered"; tone: Tone; watermark: string; buttonLabel: string };
  benefits: { title: string; layout: "grid" | "spotlight"; media: Media | null; items: { icon: IconName; title: string; text: string }[] };
  features: { items: { eyebrow: string; title: string; text: string; media: Media | null }[] };
  image_banner: { media: Media | null; headline: string; text: string; buttonLabel: string };
  statement: { quote: string; attribution: string; tone: Tone };
  video_strip: { title: string; videos: { media: Media; caption: string }[] };
  how_it_works: { title: string; steps: { title: string; text: string }[] };
  comparison: { title: string; ourLabel: string; theirLabel: string; rows: { feature: string; ours: boolean; theirs: boolean }[] };
  size_guide: { title: string; note: string; columns: string[]; rows: string[][] };
  specs: { title: string; rows: { label: string; value: string }[] };
  reviews: { title: string };
  guarantee: { title: string; text: string };
  faq: { title: string; items: { question: string; answer: string }[] };
  final_cta: { headline: string; text: string };
};
export type SectionType = keyof SectionData;
export type Section = { [T in SectionType]: { id: string; type: T; enabled: boolean; data: SectionData[T] } }[SectionType];
export type StorePage = { version: typeof STORE_PAGE_VERSION; sections: Section[] };

export const SECTION_LABELS: Record<SectionType, string> = {
  announcement: "Announcement bar", hero: "Hero and buy box", showcase: "Showcase banner", benefits: "Benefits",
  features: "Feature blocks", image_banner: "Image banner", statement: "Statement or quote",
  video_strip: "Video strip", how_it_works: "How it works", comparison: "Comparison", size_guide: "Size guide",
  specs: "Specs or ingredients", reviews: "Verified reviews", guarantee: "Guarantee and shipping", faq: "FAQ",
  final_cta: "Final call to action",
};
/** Sections that may appear at most once, and the hero, which every page needs. */
const SINGLE: SectionType[] = ["announcement", "hero", "reviews", "size_guide", "final_cta"];
const MAX_SECTIONS = 24;

export class StorePageError extends Error {}

function fail(path: string, message: string): never {
  throw new StorePageError(`${path}: ${message}`);
}
function object(value: unknown, path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") fail(path, "must be text");
  // Strip control characters except newlines; keep everything plain text.
  const clean = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
  if (clean.length > max) fail(path, `must be ${max} characters or fewer`);
  if (required && !clean) fail(path, "is required");
  return clean;
}
function list<T>(value: unknown, path: string, max: number, item: (entry: unknown, path: string) => T) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(path, "must be a list");
  if (value.length > max) fail(path, `can have at most ${max} entries`);
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}
function bool(value: unknown) { return value === true; }
function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}
const TONES = ["plain", "soft", "accent"] as const;

/** Storefront media must sit in this product's folder of the public storefront bucket. */
export function mediaPrefix(storeId: string, productId: string) { return `${storeId}/${productId}/`; }
function media(value: unknown, path: string, prefix: string, kinds: Media["kind"][] = ["image", "video"]): Media {
  const raw = object(value, path);
  const mediaPath = text(raw.path, `${path}.path`, 300, true);
  if (!mediaPath.startsWith(prefix) || !/^[A-Za-z0-9/_.-]+$/.test(mediaPath) || mediaPath.includes("..")) fail(`${path}.path`, "is not a file from this store");
  const kind = raw.kind === "video" ? "video" : raw.kind === "image" ? "image" : fail(`${path}.kind`, "must be image or video");
  if (!kinds.includes(kind)) fail(`${path}.kind`, `must be ${kinds.join(" or ")}`);
  return { path: mediaPath, kind, alt: text(raw.alt, `${path}.alt`, 160) };
}

function parseData(type: SectionType, raw: Record<string, unknown>, path: string, prefix: string): SectionData[SectionType] {
  switch (type) {
    case "announcement": return { text: text(raw.text, `${path}.text`, 120, true) };
    case "hero": return {
      headline: text(raw.headline, `${path}.headline`, 120), subheadline: text(raw.subheadline, `${path}.subheadline`, 300),
      media: list(raw.media, `${path}.media`, 12, (entry, p) => media(entry, p, prefix)),
      highlights: list(raw.highlights, `${path}.highlights`, 6, (entry, p) => text(entry, p, 90, true)),
      badges: list(raw.badges, `${path}.badges`, 4, (entry, p) => text(entry, p, 40, true)),
    };
    case "showcase": return {
      eyebrow: text(raw.eyebrow, `${path}.eyebrow`, 60), headline: text(raw.headline, `${path}.headline`, 120, true),
      text: text(raw.text, `${path}.text`, 300), media: raw.media ? media(raw.media, `${path}.media`, prefix, ["image"]) : null,
      layout: choice(raw.layout, ["split", "centered"] as const, "split"), tone: choice(raw.tone, TONES, "soft"),
      watermark: text(raw.watermark, `${path}.watermark`, 24), buttonLabel: text(raw.buttonLabel, `${path}.buttonLabel`, 30),
    };
    case "image_banner": return {
      media: raw.media ? media(raw.media, `${path}.media`, prefix) : null, headline: text(raw.headline, `${path}.headline`, 120),
      text: text(raw.text, `${path}.text`, 300), buttonLabel: text(raw.buttonLabel, `${path}.buttonLabel`, 30),
    };
    case "statement": return {
      quote: text(raw.quote, `${path}.quote`, 300, true), attribution: text(raw.attribution, `${path}.attribution`, 80),
      tone: choice(raw.tone, TONES, "accent"),
    };
    case "benefits": return {
      title: text(raw.title, `${path}.title`, 100), layout: choice(raw.layout, ["grid", "spotlight"] as const, "grid"),
      media: raw.media ? media(raw.media, `${path}.media`, prefix, ["image"]) : null,
      items: list(raw.items, `${path}.items`, 8, (entry, p) => {
        const item = object(entry, p);
        const icon = (ICONS as readonly string[]).includes(item.icon as string) ? item.icon as IconName : "check";
        return { icon, title: text(item.title, `${p}.title`, 60, true), text: text(item.text, `${p}.text`, 220) };
      }),
    };
    case "features": return {
      items: list(raw.items, `${path}.items`, 8, (entry, p) => {
        const item = object(entry, p);
        return { eyebrow: text(item.eyebrow, `${p}.eyebrow`, 40), title: text(item.title, `${p}.title`, 90, true), text: text(item.text, `${p}.text`, 600), media: item.media ? media(item.media, `${p}.media`, prefix) : null };
      }),
    };
    case "video_strip": return {
      title: text(raw.title, `${path}.title`, 100),
      videos: list(raw.videos, `${path}.videos`, 8, (entry, p) => {
        const item = object(entry, p);
        return { media: media(item.media, `${p}.media`, prefix, ["video"]), caption: text(item.caption, `${p}.caption`, 120) };
      }),
    };
    case "how_it_works": return {
      title: text(raw.title, `${path}.title`, 100),
      steps: list(raw.steps, `${path}.steps`, 6, (entry, p) => {
        const item = object(entry, p);
        return { title: text(item.title, `${p}.title`, 80, true), text: text(item.text, `${p}.text`, 300) };
      }),
    };
    case "comparison": return {
      title: text(raw.title, `${path}.title`, 100), ourLabel: text(raw.ourLabel, `${path}.ourLabel`, 40) || "Ours",
      theirLabel: text(raw.theirLabel, `${path}.theirLabel`, 40) || "Others",
      rows: list(raw.rows, `${path}.rows`, 12, (entry, p) => {
        const item = object(entry, p);
        return { feature: text(item.feature, `${p}.feature`, 100, true), ours: bool(item.ours), theirs: bool(item.theirs) };
      }),
    };
    case "size_guide": {
      const columns = list(raw.columns, `${path}.columns`, 8, (entry, p) => text(entry, p, 30, true));
      return {
        title: text(raw.title, `${path}.title`, 100), note: text(raw.note, `${path}.note`, 300), columns,
        rows: list(raw.rows, `${path}.rows`, 15, (entry, p) => {
          const cells = list(entry, p, 8, (cell, cp) => text(cell, cp, 30));
          if (cells.length !== columns.length) fail(p, "must have one value per column");
          return cells;
        }),
      };
    }
    case "specs": return {
      title: text(raw.title, `${path}.title`, 100),
      rows: list(raw.rows, `${path}.rows`, 25, (entry, p) => {
        const item = object(entry, p);
        return { label: text(item.label, `${p}.label`, 60, true), value: text(item.value, `${p}.value`, 300, true) };
      }),
    };
    case "reviews": return { title: text(raw.title, `${path}.title`, 100) };
    case "guarantee": return { title: text(raw.title, `${path}.title`, 100, true), text: text(raw.text, `${path}.text`, 600) };
    case "faq": return {
      title: text(raw.title, `${path}.title`, 100),
      items: list(raw.items, `${path}.items`, 15, (entry, p) => {
        const item = object(entry, p);
        return { question: text(item.question, `${p}.question`, 160, true), answer: text(item.answer, `${p}.answer`, 1200, true) };
      }),
    };
    case "final_cta": return { headline: text(raw.headline, `${path}.headline`, 120, true), text: text(raw.text, `${path}.text`, 300) };
  }
}

/** Validates and normalises a stored or submitted page. Throws StorePageError with a readable path. */
export function parseStorePage(value: unknown, storeId: string, productId: string): StorePage {
  const raw = object(value, "page");
  if (raw.version !== STORE_PAGE_VERSION) fail("page.version", `must be ${STORE_PAGE_VERSION}`);
  const prefix = mediaPrefix(storeId, productId);
  const seen = new Set<string>();
  const sections = list(raw.sections, "page.sections", MAX_SECTIONS, (entry, path) => {
    const section = object(entry, path);
    const type = section.type as SectionType;
    if (!(type in SECTION_LABELS)) fail(`${path}.type`, "is not a known section");
    const id = text(section.id, `${path}.id`, 40, true);
    if (!/^[a-z0-9-]+$/.test(id) || seen.has(id)) fail(`${path}.id`, "must be unique lowercase letters, numbers, and hyphens");
    seen.add(id);
    return { id, type, enabled: section.enabled !== false, data: parseData(type, object(section.data ?? {}, `${path}.data`), `${path}.data`, prefix) } as Section;
  });
  for (const type of SINGLE) {
    if (sections.filter((section) => section.type === type).length > 1) fail("page.sections", `${SECTION_LABELS[type]} can only appear once`);
  }
  return { version: STORE_PAGE_VERSION, sections };
}

/** Requirements to publish: a visible hero with at least one image. */
export function storePageReadiness(page: StorePage) {
  const hero = page.sections.find((section) => section.type === "hero" && section.enabled);
  const problems: string[] = [];
  if (!hero) problems.push("Add and enable the Hero and buy box section.");
  else if (hero.type === "hero" && !hero.data.media.some((item) => item.kind === "image")) problems.push("Add at least one product image to the hero gallery.");
  return problems;
}

/** A sensible starting page for a new physical product, in the recommended order. */
export function starterStorePage(): StorePage {
  return {
    version: STORE_PAGE_VERSION,
    sections: [
      { id: "announcement", type: "announcement", enabled: true, data: { text: "Free shipping on every US order" } },
      { id: "hero", type: "hero", enabled: true, data: { headline: "", subheadline: "", media: [], highlights: [], badges: ["Free US shipping", "30-day returns", "Secure checkout"] } },
      { id: "benefits", type: "benefits", enabled: true, data: { title: "Why you'll love it", layout: "grid", media: null, items: [] } },
      { id: "features", type: "features", enabled: true, data: { items: [] } },
      { id: "how-it-works", type: "how_it_works", enabled: false, data: { title: "How it works", steps: [] } },
      { id: "comparison", type: "comparison", enabled: false, data: { title: "Why it's different", ourLabel: "Ours", theirLabel: "Others", rows: [] } },
      { id: "specs", type: "specs", enabled: false, data: { title: "Specifications", rows: [] } },
      { id: "reviews", type: "reviews", enabled: true, data: { title: "What customers say" } },
      { id: "guarantee", type: "guarantee", enabled: true, data: { title: "Shipping and returns", text: "" } },
      { id: "faq", type: "faq", enabled: true, data: { title: "Questions, answered", items: [] } },
      { id: "final-cta", type: "final_cta", enabled: true, data: { headline: "Ready when you are", text: "" } },
    ],
  };
}

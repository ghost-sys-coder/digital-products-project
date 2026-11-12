// Field descriptions for every store page section. The editor renders its forms from these, and
// turns validation paths (page.sections[2].data.items[0].title) into readable labels. Limits mirror
// lib/store-page.ts, which stays the authority.
import type { Section, SectionType, StorePage } from "@/lib/store-page";

type Accept = readonly ("image" | "video")[];
type Base = { key: string; label: string; help?: string };
export type FieldSpec = Base & (
  | { kind: "text"; max: number; required?: boolean; placeholder?: string }
  | { kind: "textarea"; max: number; required?: boolean; rows?: number; placeholder?: string }
  | { kind: "choice"; options: readonly { value: string; label: string }[] }
  | { kind: "icon"; optional?: boolean }
  | { kind: "media"; accept: Accept; required?: boolean }
  | { kind: "mediaList"; accept: Accept; max: number }
  | { kind: "strings"; max: number; itemMax: number; placeholder?: string }
  | { kind: "list"; itemLabel: string; max: number; fields: FieldSpec[]; create: () => Record<string, unknown>; summary: (item: Record<string, unknown>) => string }
  | { kind: "toggle" }
  | { kind: "table" }
);

const IMAGE = ["image"] as const;
const ANY = ["image", "video"] as const;
const TONE = { kind: "choice", key: "tone", label: "Background", options: [
  { value: "plain", label: "Page colour" }, { value: "soft", label: "Soft surface" }, { value: "accent", label: "Brand colour" },
] } as const satisfies FieldSpec;
const text = (item: Record<string, unknown>, key: string) => typeof item[key] === "string" ? item[key] as string : "";

export const SECTION_SPECS: Record<SectionType, { description: string; fields: FieldSpec[] }> = {
  announcement: { description: "A slim bar above the header for an offer or shipping message.", fields: [
    { kind: "text", key: "text", label: "Message", max: 120, required: true, placeholder: "Free tracked US shipping · 30-day returns" },
  ] },
  hero: { description: "The product gallery, price, options and buy button. Every store needs one.", fields: [
    { kind: "mediaList", key: "media", label: "Gallery", accept: ANY, max: 12, help: "The first image is the main product photo. Add a short clip to show it in action; it plays when its slide is open." },
    { kind: "text", key: "headline", label: "Line under the product name", max: 120, placeholder: "Turn any room into a galaxy." },
    { kind: "textarea", key: "subheadline", label: "Short description", max: 300, rows: 3 },
    { kind: "strings", key: "highlights", label: "Highlights", max: 6, itemMax: 90, placeholder: "12 colour modes and a sleep timer", help: "Shown as a checklist beside the price." },
    { kind: "strings", key: "badges", label: "Trust badges", max: 4, itemMax: 40, placeholder: "30-day returns", help: "Short promises under the buy button. Only promise what your policies say." },
  ] },
  showcase: { description: "A bold banner with a headline, image and an optional buy button.", fields: [
    { kind: "text", key: "eyebrow", label: "Eyebrow", max: 60, placeholder: "Night mode, upgraded" },
    { kind: "text", key: "headline", label: "Headline", max: 120, required: true },
    { kind: "textarea", key: "text", label: "Text", max: 300, rows: 3 },
    { kind: "media", key: "media", label: "Image", accept: IMAGE },
    { kind: "choice", key: "layout", label: "Layout", options: [{ value: "split", label: "Image beside text" }, { value: "centered", label: "Centred" }] },
    TONE,
    { kind: "text", key: "watermark", label: "Background word", max: 24, help: "A large, faint word behind the banner. Optional." },
    { kind: "text", key: "buttonLabel", label: "Button label", max: 30, placeholder: "Shop now", help: "Leave empty for no button." },
  ] },
  benefits: { description: "Icon highlights in a grid, or around a product cut-out.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "choice", key: "layout", label: "Layout", options: [{ value: "grid", label: "Grid" }, { value: "spotlight", label: "Spotlight around an image" }] },
    { kind: "media", key: "media", label: "Spotlight image", accept: IMAGE, help: "Used by the spotlight layout. A cut-out on a transparent background looks best." },
    { kind: "list", key: "items", label: "Benefits", itemLabel: "Benefit", max: 8, create: () => ({ icon: "sparkles", title: "", text: "" }), summary: (item) => text(item, "title"), fields: [
      { kind: "icon", key: "icon", label: "Icon" },
      { kind: "text", key: "title", label: "Title", max: 60, required: true },
      { kind: "textarea", key: "text", label: "Text", max: 220, rows: 2 },
    ] },
  ] },
  features: { description: "Alternating image and text blocks that tell the product's story.", fields: [
    { kind: "list", key: "items", label: "Blocks", itemLabel: "Block", max: 8, create: () => ({ eyebrow: "", title: "", text: "", media: null }), summary: (item) => text(item, "title"), fields: [
      { kind: "media", key: "media", label: "Image or video", accept: ANY },
      { kind: "text", key: "eyebrow", label: "Eyebrow", max: 40 },
      { kind: "text", key: "title", label: "Title", max: 90, required: true },
      { kind: "textarea", key: "text", label: "Text", max: 600, rows: 4, help: "Leave a blank line to start a new paragraph." },
    ] },
  ] },
  image_banner: { description: "A full-width image or video with a headline over it.", fields: [
    { kind: "media", key: "media", label: "Image or video", accept: ANY },
    { kind: "text", key: "headline", label: "Headline", max: 120 },
    { kind: "textarea", key: "text", label: "Text", max: 300, rows: 2 },
    { kind: "text", key: "buttonLabel", label: "Button label", max: 30, help: "Leave empty for no button." },
  ] },
  bento: { description: "A grid of image, video and text tiles in mixed sizes.", fields: [
    { kind: "text", key: "eyebrow", label: "Eyebrow", max: 60 },
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "choice", key: "layout", label: "Layout", options: [{ value: "bento", label: "Bento grid" }, { value: "masonry", label: "Masonry gallery" }] },
    { kind: "list", key: "tiles", label: "Tiles", itemLabel: "Tile", max: 12, create: () => ({ size: "small", media: null, icon: null, title: "", text: "", tone: "soft" }), summary: (item) => text(item, "title") || (item.media ? "Image tile" : ""), fields: [
      { kind: "choice", key: "size", label: "Size", options: [{ value: "small", label: "Small" }, { value: "wide", label: "Wide" }, { value: "tall", label: "Tall" }, { value: "large", label: "Large" }] },
      { kind: "media", key: "media", label: "Image or video", accept: ANY },
      { kind: "icon", key: "icon", label: "Icon", optional: true },
      { kind: "text", key: "title", label: "Title", max: 60, help: "A tile needs an image or a title." },
      { kind: "textarea", key: "text", label: "Text", max: 160, rows: 2 },
      TONE,
    ] },
  ] },
  statement: { description: "A large quote or brand statement.", fields: [
    { kind: "textarea", key: "quote", label: "Statement", max: 300, required: true, rows: 3 },
    { kind: "text", key: "attribution", label: "Attribution", max: 80, placeholder: "The Lumora team" },
    TONE,
  ] },
  video_strip: { description: "Vertical clips side by side, TikTok style.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "list", key: "videos", label: "Videos", itemLabel: "Video", max: 8, create: () => ({ media: null, caption: "" }), summary: (item) => text(item, "caption"), fields: [
      { kind: "media", key: "media", label: "Video", accept: ["video"], required: true, help: "Vertical 9:16 clips under 15 seconds work best." },
      { kind: "text", key: "caption", label: "Caption", max: 120 },
    ] },
  ] },
  how_it_works: { description: "Numbered steps.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "list", key: "steps", label: "Steps", itemLabel: "Step", max: 6, create: () => ({ title: "", text: "" }), summary: (item) => text(item, "title"), fields: [
      { kind: "text", key: "title", label: "Title", max: 80, required: true },
      { kind: "textarea", key: "text", label: "Text", max: 300, rows: 2 },
    ] },
  ] },
  comparison: { description: "Your product against the alternatives, tick by tick.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "text", key: "ourLabel", label: "Your column", max: 40 },
    { kind: "text", key: "theirLabel", label: "Other column", max: 40 },
    { kind: "list", key: "rows", label: "Rows", itemLabel: "Row", max: 12, create: () => ({ feature: "", ours: true, theirs: false }), summary: (item) => text(item, "feature"), fields: [
      { kind: "text", key: "feature", label: "Feature", max: 100, required: true },
      { kind: "toggle", key: "ours", label: "Yours has it" },
      { kind: "toggle", key: "theirs", label: "Others have it" },
    ] },
  ] },
  size_guide: { description: "A measurement table for clothing and shoes.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "textarea", key: "note", label: "Note", max: 300, rows: 2, placeholder: "Measurements are in inches. Between sizes? Size up." },
    { kind: "table", key: "rows", label: "Table" },
  ] },
  specs: { description: "Specifications, materials or ingredients.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "list", key: "rows", label: "Rows", itemLabel: "Row", max: 25, create: () => ({ label: "", value: "" }), summary: (item) => [text(item, "label"), text(item, "value")].filter(Boolean).join(": "), fields: [
      { kind: "text", key: "label", label: "Label", max: 60, required: true, placeholder: "Power" },
      { kind: "text", key: "value", label: "Value", max: 300, required: true, placeholder: "USB-C, 5V / 2A" },
    ] },
  ] },
  reviews: { description: "Verified reviews from real buyers. Hidden until your first review arrives.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
  ] },
  guarantee: { description: "Your shipping and returns promise, with the live shipping options listed under it.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100, required: true },
    { kind: "textarea", key: "text", label: "Text", max: 600, rows: 3 },
  ] },
  faq: { description: "Common questions and answers.", fields: [
    { kind: "text", key: "title", label: "Title", max: 100 },
    { kind: "list", key: "items", label: "Questions", itemLabel: "Question", max: 15, create: () => ({ question: "", answer: "" }), summary: (item) => text(item, "question"), fields: [
      { kind: "text", key: "question", label: "Question", max: 160, required: true },
      { kind: "textarea", key: "answer", label: "Answer", max: 1200, required: true, rows: 3 },
    ] },
  ] },
  final_cta: { description: "A closing headline with the buy button and price.", fields: [
    { kind: "text", key: "headline", label: "Headline", max: 120, required: true },
    { kind: "textarea", key: "text", label: "Text", max: 300, rows: 2 },
  ] },
};

/** Starting content for a newly added section. */
export function newSectionData(type: SectionType): Section["data"] {
  switch (type) {
    case "announcement": return { text: "" };
    case "hero": return { headline: "", subheadline: "", media: [], highlights: [], badges: [] };
    case "showcase": return { eyebrow: "", headline: "", text: "", media: null, layout: "split", tone: "soft", watermark: "", buttonLabel: "" };
    case "benefits": return { title: "Why you'll love it", layout: "grid", media: null, items: [] };
    case "features": return { items: [] };
    case "image_banner": return { media: null, headline: "", text: "", buttonLabel: "" };
    case "bento": return { eyebrow: "", title: "", layout: "bento", tiles: [] };
    case "statement": return { quote: "", attribution: "", tone: "accent" };
    case "video_strip": return { title: "See it in action", videos: [] };
    case "how_it_works": return { title: "How it works", steps: [] };
    case "comparison": return { title: "Why it's different", ourLabel: "Ours", theirLabel: "Others", rows: [] };
    case "size_guide": return { title: "Size guide", note: "", columns: ["Size", "Chest (in)", "Length (in)"], rows: [] };
    case "specs": return { title: "Specifications", rows: [] };
    case "reviews": return { title: "What customers say" };
    case "guarantee": return { title: "Shipping and returns", text: "" };
    case "faq": return { title: "Questions, answered", items: [] };
    case "final_cta": return { headline: "Ready when you are", text: "" };
  }
}

/** Sections that may appear only once (mirrors lib/store-page.ts). */
export const SINGLE_SECTIONS: SectionType[] = ["announcement", "hero", "reviews", "size_guide", "final_cta"];

const LABELS: Record<string, string> = { media: "Media", path: "File", alt: "Description", poster: "Poster", kind: "Type" };

/**
 * Turns a validation message such as "page.sections[2].data.items[0].title: is required" into
 * "Benefits › Benefit 1 › Title is required", and says which section it is about.
 */
export function describePageError(message: string, page: StorePage, labels: Record<SectionType, string>) {
  const match = /^page\.sections\[(\d+)\]([^:]*): (.*)$/.exec(message);
  if (!match) return { section: -1, text: message.replace(/^page[^:]*: /, "") };
  const index = Number(match[1]);
  const section = page.sections[index];
  if (!section) return { section: -1, text: match[3] };
  const parts = [labels[section.type]];
  let fields: FieldSpec[] | undefined = SECTION_SPECS[section.type].fields;
  for (const token of match[2].replace(/^\.data\.?/, "").split(".").filter(Boolean)) {
    const [, key, position] = /^([A-Za-z]+)(?:\[(\d+)\])?$/.exec(token) ?? [];
    const field: FieldSpec | undefined = fields?.find((entry) => entry.key === key);
    if (field?.kind === "list") {
      parts.push(position !== undefined ? `${field.itemLabel} ${Number(position) + 1}` : field.label);
      fields = field.fields;
    } else {
      const label = field?.label ?? LABELS[key] ?? key;
      parts.push(position !== undefined ? `${label} ${Number(position) + 1}` : label);
      fields = undefined;
    }
  }
  const problem = match[3] === "must be an object" ? "is missing" : match[3];
  return { section: index, text: `${parts.join(" › ")} ${problem}` };
}

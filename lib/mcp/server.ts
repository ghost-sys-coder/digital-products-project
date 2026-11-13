import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HttpError } from "../http";
import { createStore } from "../manage-stores";
import { createResearch, createStoreFromResearch, listResearch, updateResearch } from "../research";
import { RESEARCH_KINDS, STAGES } from "../research.types";
import { searchMetaAds } from "../meta-ads";
import { cjDetail, searchCj } from "../cj";
import { getCatalogProduct } from "../catalog";
import { THEMES } from "../store-themes";
import type { McpScope } from "../database.types";
import { logActivity } from "./activity";
import { getOrder, listCatalogue, listOrders, ORDER_FILTERS, researchBoard, storeOverview } from "./insights";
import { addStoreMedia, editableStore, saveStoreDraft } from "./stores";
import { attachDigitalFile, createDigitalDraft, describeDigital, updateDigitalDraft } from "./digital";
import { appendUpload, decodeBase64, downloadFile, finishUpload, startUpload } from "./files";
import type { Caller } from "./oauth";

// The studio's MCP server (/api/mcp). One server for every assistant: Claude, ChatGPT, Codex and
// Claude Code see the same tools. Each connection only gets the tools its scopes allow, and every call
// is logged. Built fresh per request (stateless), so it scales like any other route.

const INSTRUCTIONS = `VeilCode Studio is a one-person store selling digital products (guides, templates; pages at /p/<slug>) and physical dropshipped products, each with its own single-product store (/s/<slug>), mainly to US shoppers.

Use these tools to report on the store, research products, and build drafts:
- Performance and orders: get_store_overview, list_orders, get_order. Lists leave out customer names and addresses; get_order shows them for one order.
- Research: search_meta_ads (UK/EU only — for US ads use another Meta Ad Library source and save what you find), search_cj_products and get_cj_product_costs for supplier costs, then save_research_idea. Research done anywhere (web, TikTok, Amazon, other tools) belongs on the board too: save it with save_research_idea and keep it current with update_research_idea.
- Building: create_store (optionally from a research idea), get_store, edit the document, save_store_draft. Add images with import_file (a link, an uploaded file, or pieces via start_file_upload/upload_file_part). Digital products: create_digital_product_draft, update_digital_product_draft, and import_file for the cover and the PDF/ZIP.

Rules: you can only create and change drafts. Publishing, refunds, payments and settings stay with the owner in the admin; tell them what's ready to review and link the preview. Amounts are in cents (USD unless stated). A healthy dropshipping margin is 30%+ before ad spend.`;

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const ok = (data: object): Result => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> });
const failure = (message: string): Result => ({ content: [{ type: "text", text: message }], isError: true });

const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const lookup = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const cents = z.number().int().min(0).max(10_000_000);
const adSchema = z.object({
  url: z.string().describe("Link to the ad (Meta Ad Library, TikTok, etc.)"),
  page: z.string().optional().describe("Advertiser or page name"),
  startedAt: z.string().optional().describe("Date the ad started running, YYYY-MM-DD"),
  note: z.string().optional().describe("Why it matters: versions running, engagement, angle"),
});
const supplierSchema = z.object({
  name: z.string().describe("Product name at the supplier"), url: z.string().optional(), id: z.string().optional(),
  source: z.enum(["cj", "manual"]).optional(), cost: cents.describe("Product cost in cents"),
  shipping: cents.optional().describe("Shipping to the US in cents"), shippingName: z.string().optional(), days: z.string().optional().describe("Delivery time, e.g. 7-12 days"),
});
const fileSchema = z.object({ download_url: z.string(), file_id: z.string().optional() }).describe("A file the user attached (ChatGPT passes these automatically)");

function summarise(args: Record<string, unknown>) {
  const pick = ["query", "reference", "title", "name", "id", "product_id", "purpose", "stage"].map((key) => args[key]).find((value) => typeof value === "string");
  return typeof pick === "string" ? pick : "";
}

export function buildMcpServer(caller: Caller) {
  const server = new McpServer({ name: "veilcode-studio", title: "VeilCode Studio", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const allowed = new Set<McpScope>(caller.scopes);

  function tool<S extends z.ZodRawShape>(scope: McpScope, name: string, config: { title: string; description: string; input: S; annotations: object; meta?: Record<string, unknown> },
    run: (args: z.infer<z.ZodObject<S>>) => Promise<object>) {
    if (!allowed.has(scope)) return;
    server.registerTool(name, { title: config.title, description: config.description, inputSchema: config.input, annotations: config.annotations, ...(config.meta ? { _meta: config.meta } : {}) },
      (async (args: z.infer<z.ZodObject<S>>) => {
        try {
          const data = await run(args);
          await logActivity(caller.connection.id, name, summarise(args as Record<string, unknown>), true);
          return ok(data);
        } catch (error) {
          const message = error instanceof HttpError ? error.message : "Something went wrong on the studio's side. Try again in a moment.";
          if (!(error instanceof HttpError)) console.error("MCP tool failed", name);
          await logActivity(caller.connection.id, name, `${summarise(args as Record<string, unknown>)} — ${message}`, false);
          return failure(message);
        }
      }) as never);
  }

  // ── Read ──────────────────────────────────────────────────────────────────────────────────
  tool("read", "get_store_overview", {
    title: "Store performance", annotations: read,
    description: "Sales (gross, refunded, net per currency), orders in the last 7 days, what needs attention (orders to place with suppliers, waiting to ship, unsent download emails), best sellers, catalogue and research counts.",
    input: { days: z.number().int().min(1).max(365).optional().describe("Period in days, default 30") },
  }, ({ days }) => storeOverview(days ?? 30));

  tool("read", "list_orders", {
    title: "List orders", annotations: read,
    description: "Recent orders without customer names, emails or addresses. Filter by status: needs_ordering (place with supplier), ordered (waiting to ship), shipped, delivered, cancelled, email_pending (digital download email not sent).",
    input: {
      status: z.enum(ORDER_FILTERS).optional(), kind: z.enum(["digital", "physical"]).optional(),
      days: z.number().int().min(1).max(365).optional().describe("Default 30"), limit: z.number().int().min(1).max(50).optional().describe("Default 25"),
    },
  }, ({ status, kind, days, limit }) => listOrders({ filter: status ?? "all", kind, days: days ?? 30, limit: limit ?? 25 }));

  tool("read", "get_order", {
    title: "Order details", annotations: read,
    description: "One order in full, including the customer's name, email and shipping address, items, supplier and tracking. Use only when the owner asks about a specific order.",
    input: { reference: z.string().describe("Order reference from the confirmation email (8 characters)") },
  }, ({ reference }) => getOrder(reference));

  tool("read", "list_products", {
    title: "List products", annotations: read,
    description: "Every digital product and physical store, with status (draft or published), price, and page URL.",
    input: { kind: z.enum(["digital", "physical"]).optional() },
  }, ({ kind }) => listCatalogue(kind));

  tool("read", "get_store", {
    title: "Get a store", annotations: read,
    description: "A physical product store as an editable document (page sections, variants, shipping, policies), its media, and a guide to every field. Edit it and send it back with save_store_draft.",
    input: { product_id: z.string().describe("The store's product id, from list_products or create_store") },
  }, ({ product_id }) => editableStore(product_id));

  tool("read", "get_digital_product", {
    title: "Get a digital product", annotations: read,
    description: "A digital product's details: description, what's included, price, and whether it has a cover and download file.",
    input: { product_id: z.string() },
  }, async ({ product_id }) => {
    const product = /^[0-9a-f-]{36}$|^lead-to-kickoff$/i.test(product_id) ? await getCatalogProduct(product_id) : null;
    if (!product || product.kind !== "digital") throw new HttpError(404, "That digital product wasn't found.");
    return describeDigital(product);
  });

  tool("read", "list_research_ideas", {
    title: "Research board", annotations: read,
    description: "Product ideas on the research board, with stage, ad evidence, supplier costs, price, profit per sale and any store made from them.",
    input: { stage: z.enum(STAGES).optional() },
  }, ({ stage }) => researchBoard(stage));

  tool("read", "get_research_idea", {
    title: "Research idea", annotations: read,
    description: "One research idea in full: notes, every saved ad, supplier details and numbers.",
    input: { id: z.string() },
  }, async ({ id }) => {
    const idea = (await listResearch()).find((entry) => entry.id === id);
    if (!idea) throw new HttpError(404, "That research idea wasn't found.");
    return idea;
  });

  // ── Research ──────────────────────────────────────────────────────────────────────────────
  tool("research", "search_meta_ads", {
    title: "Search Meta ads (UK & EU)", annotations: lookup,
    description: "Active Meta ads delivered in the UK and EU matching a phrase, ranked by days running and number of versions (signs an ad is profitable). Meta's API can't return US product ads.",
    input: { query: z.string().min(2).max(100) },
  }, ({ query }) => searchMetaAds(query));

  tool("research", "search_cj_products", {
    title: "Search CJ Dropshipping", annotations: lookup,
    description: "Products in CJ Dropshipping's catalogue: lowest price and how many stores list each (a rough demand signal).",
    input: { query: z.string().min(2).max(100) },
  }, async ({ query }) => ({ products: await searchCj(query) }));

  tool("research", "get_cj_product_costs", {
    title: "CJ costs and US shipping", annotations: lookup,
    description: "A CJ product's cheapest variant cost and cheapest shipping to the US, in cents, ready to save as a research idea's supplier.",
    input: { cj_product_id: z.string() },
  }, async ({ cj_product_id }) => ({ supplier: await cjDetail(cj_product_id) }));

  tool("research", "save_research_idea", {
    title: "Save a research idea", annotations: write,
    description: "Adds a product idea to the research board with the evidence found (ads, supplier, notes, target price). Use it for research done anywhere, so it's all in one place.",
    input: {
      title: z.string().min(1).max(120), kind: z.enum(RESEARCH_KINDS).optional().describe("physical (default) or digital"),
      notes: z.string().max(5000).optional(), image_url: z.string().optional(), target_price_cents: cents.optional(),
      supplier: supplierSchema.optional(), ads: z.array(adSchema).max(20).optional(), stage: z.enum(STAGES).optional(),
    },
  }, async ({ target_price_cents, ads, ...rest }) => ({
    idea: await createResearch({ ...rest, ...(target_price_cents !== undefined ? { target_price: target_price_cents } : {}), ...(ads ? { ads: ads.map((ad) => ({ ...ad, source: "manual" })) } : {}) }),
  }));

  tool("research", "update_research_idea", {
    title: "Update a research idea", annotations: write,
    description: "Changes an idea's stage, notes, numbers, supplier or ads. Fields you leave out stay as they are; ads and supplier replace the saved ones.",
    input: {
      id: z.string(), title: z.string().min(1).max(120).optional(), kind: z.enum(RESEARCH_KINDS).optional(), stage: z.enum(STAGES).optional(),
      notes: z.string().max(5000).optional(), image_url: z.string().nullable().optional(), target_price_cents: cents.nullable().optional(),
      supplier: supplierSchema.nullable().optional(), ads: z.array(adSchema).max(20).optional(),
    },
  }, async ({ target_price_cents, ads, ...rest }) => ({
    idea: await updateResearch({ ...rest, ...(target_price_cents !== undefined ? { target_price: target_price_cents } : {}), ...(ads ? { ads: ads.map((ad) => ({ ...ad, source: "manual" })) } : {}) }),
  }));

  // ── Build (drafts only) ───────────────────────────────────────────────────────────────────
  tool("build", "create_store", {
    title: "Create a draft store", annotations: write,
    description: "Creates a draft single-product store for a physical product, from a research idea (named after it, and linked) or from scratch. Then use get_store and save_store_draft to build the page.",
    input: {
      slug: z.string().describe("Store URL: lowercase letters, numbers, hyphens (/s/<slug>)"),
      research_idea_id: z.string().optional(), name: z.string().max(120).optional().describe("Needed when not creating from a research idea"),
      theme: z.enum(THEMES).optional(),
    },
  }, async ({ slug, research_idea_id, name, theme }) => {
    const { productId } = research_idea_id
      ? await createStoreFromResearch({ id: research_idea_id, slug, theme })
      : await createStore({ name, slug, theme }).then(({ id }) => ({ productId: id }));
    return { productId, next: "Call get_store with this productId, fill in the page, variants, shipping and policies, then save_store_draft." };
  });

  tool("build", "save_store_draft", {
    title: "Save a draft store", annotations: write,
    description: "Saves a store document (from get_store, edited) as a draft. Send the whole document with the revision you received. Only draft stores can be changed.",
    input: { document: z.record(z.string(), z.unknown()).describe("The full document from get_store, edited") },
  }, ({ document }) => saveStoreDraft(document));

  tool("build", "create_digital_product_draft", {
    title: "Create a digital product draft", annotations: write,
    description: "Creates a draft digital product (guide, template, toolkit). Add the cover image and the PDF/ZIP afterwards with import_file. Optionally links the research idea it came from.",
    input: {
      name: z.string().min(1).max(120), slug: z.string().describe("URL: lowercase letters, numbers, hyphens (/p/<slug>)"),
      tagline: z.string().max(200).optional(), description: z.string().max(10000).optional(), includes: z.array(z.string().max(200)).max(12).optional(),
      price_cents: z.number().int().min(50), currency: z.string().optional().describe("usd (default), gbp, eur, cad, aud"),
      research_idea_id: z.string().optional(),
    },
  }, ({ price_cents, research_idea_id, ...fields }) => createDigitalDraft({ ...fields, price: price_cents }, research_idea_id));

  tool("build", "update_digital_product_draft", {
    title: "Update a digital product draft", annotations: write,
    description: "Changes a draft digital product's text, price or included items. Fields you leave out stay as they are.",
    input: {
      product_id: z.string(), name: z.string().min(1).max(120).optional(), slug: z.string().optional(), tagline: z.string().max(200).optional(),
      description: z.string().max(10000).optional(), includes: z.array(z.string().max(200)).max(12).optional(),
      price_cents: z.number().int().min(50).optional(), currency: z.string().optional(),
    },
  }, ({ product_id, price_cents, ...fields }) => updateDigitalDraft(product_id, { ...fields, ...(price_cents !== undefined ? { price: price_cents } : {}) }));

  tool("build", "import_file", {
    title: "Add an image or file", annotations: write,
    description: "Adds a file to a draft: store_media (images/videos for a store's page and variants), cover (a digital product's cover image), or download (its PDF/ZIP). Give one source: a public https url, an upload_id from start_file_upload, or an attached file.",
    input: {
      product_id: z.string(), purpose: z.enum(["store_media", "cover", "download"]),
      url: z.string().optional(), upload_id: z.string().optional(), file: fileSchema.optional(),
      base64: z.string().max(1_400_000).optional().describe("Small files (≤1 MB) inline as base64; use start_file_upload for larger ones"),
    },
    meta: { "openai/fileParams": ["file"] },
  }, async ({ product_id, purpose, url, upload_id, file, base64 }) => {
    const sources = [url, upload_id, file?.download_url, base64].filter(Boolean);
    if (sources.length !== 1) throw new HttpError(400, "Give exactly one source: url, upload_id, file or base64.");
    let bytes: Uint8Array; let name = "file";
    if (upload_id) {
      const upload = await finishUpload(caller.connection.id, upload_id);
      if (upload.productId !== product_id) throw new HttpError(400, "That upload was started for a different product.");
      bytes = upload.bytes; name = upload.filename;
    } else if (base64) {
      bytes = decodeBase64(base64);
      if (bytes.length > 1024 * 1024) throw new HttpError(400, "Inline files can be up to 1 MB. Use start_file_upload for larger ones.");
    } else {
      const downloaded = await downloadFile((url ?? file!.download_url)!);
      bytes = downloaded.bytes; name = downloaded.name;
    }
    return purpose === "store_media" ? addStoreMedia(product_id, bytes) : attachDigitalFile(product_id, purpose, bytes, name);
  });

  tool("build", "start_file_upload", {
    title: "Start a file upload", annotations: write,
    description: "For sending a file's bytes in pieces when there's no public link: start here, send base64 pieces in order with upload_file_part, then call import_file with the upload_id.",
    input: { product_id: z.string(), filename: z.string().max(255), size_bytes: z.number().int().min(1).max(25 * 1024 * 1024) },
  }, async ({ product_id, filename, size_bytes }) => {
    const product = await getCatalogProduct(product_id);
    if (!product) throw new HttpError(404, "That product wasn't found.");
    return startUpload(caller.connection.id, product.id, filename, size_bytes);
  });

  tool("build", "upload_file_part", {
    title: "Send part of a file", annotations: write,
    description: "Sends the next base64 piece of an upload (index 0, 1, 2…). Each piece's length must be a multiple of 4 characters, up to 1,000,000.",
    input: { upload_id: z.string(), index: z.number().int().min(0), data: z.string() },
  }, ({ upload_id, index, data }) => appendUpload(caller.connection.id, upload_id, index, data));

  return server;
}

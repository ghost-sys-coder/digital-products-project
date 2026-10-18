// Static browser-review fixtures using real page components and mocked services.
// These files are written under .preview and never served by the production app.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { resetFakes, seedProduct, storageExists } from "./fakes";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fixture-token" }) }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
  redirect: (url: string) => { throw new Error(`Redirect: ${url}`); },
  notFound: () => { throw new Error("Not found"); },
}));

import Home from "../app/page";
import Dashboard from "../app/admin/page";
import ProductPage from "../app/p/[slug]/page";
import EditProduct from "../app/admin/products/[id]/page";

it("renders real store and owner pages with an isolated catalog for browser review", async () => {
  resetFakes();
  const product = seedProduct({ id: "lead-to-kickoff", slug: "lead-to-kickoff", name: "Lead to Kickoff: The Client Onboarding System", tagline: "Turn a new inquiry into a confident project kickoff.", description: "A practical guide and editable templates for the work between a new lead and a great kickoff.\n\nBuild a clear, repeatable process that makes every new client feel in good hands." });
  const views = {
    "index.html": await Home(),
    "dashboard.html": await Dashboard(),
    "product.html": await ProductPage({ params: Promise.resolve({ slug: product.slug }), searchParams: Promise.resolve({}) }),
    "editor.html": await EditProduct({ params: Promise.resolve({ id: product.id }), searchParams: Promise.resolve({}) }),
  };
  const css = await readFile(join(process.cwd(), "app/globals.css"), "utf8");
  const output = join(process.cwd(), ".preview");
  await mkdir(output, { recursive: true });
  for (const [filename, view] of Object.entries(views)) {
    const markup = renderToStaticMarkup(view);
    expect(markup).not.toContain("owner-token");
    await writeFile(join(output, filename), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local visual fixture</title><style>${css}</style></head><body>${markup}</body></html>`, "utf8");
  }
});

it("does not label a seeded filename as attached when the stored PDF is missing", async () => {
  resetFakes();
  const product = seedProduct();
  storageExists.mockResolvedValueOnce({ data: false, error: { status: 400, message: "Object not found" } });
  const view = await EditProduct({ params: Promise.resolve({ id: product.id }), searchParams: Promise.resolve({}) });
  const markup = renderToStaticMarkup(view);
  expect(markup).toContain("The saved download could not be found.");
  expect(markup).not.toContain("Your download is saved and ready for delivery.");
});

it("shows an uncertain file status during a Storage outage rather than claiming attachment or absence", async () => {
  resetFakes();
  const product = seedProduct();
  storageExists.mockRejectedValueOnce(new Error("Storage unavailable"));
  const view = await EditProduct({ params: Promise.resolve({ id: product.id }), searchParams: Promise.resolve({}) });
  const markup = renderToStaticMarkup(view);
  expect(markup).toContain("check the saved download. Reload the page or choose a replacement.");
  expect(markup).not.toContain("Your download is saved and ready for delivery.");
  expect(markup).not.toContain("The saved download could not be found.");
});

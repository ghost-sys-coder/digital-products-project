import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakes, seedPhysicalStore, seedProduct, state, storageDownload } from "./fakes";
import { listStoreCards } from "../lib/storefront";
import { homePhotos, readHomePhoto } from "../lib/home-photos";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));

import { GET as versionedCover } from "../app/api/products/[id]/cover/[version]/route";
import { GET as photoRoute } from "../app/api/home-photo/[name]/[version]/route";

beforeEach(() => { resetFakes(); });

describe("homepage store cards", () => {
  it("lists a published store with its brand, first hero image and lowest price", async () => {
    seedPhysicalStore({ status: "published" });
    expect(await listStoreCards()).toEqual([{
      slug: "glow", name: "Glow Lamp", tagline: "A useful kit.", brand: "Lumora Co.", currency: "usd", fromPrice: 4900,
      image: { url: expect.stringMatching(/\/storage\/v1\/object\/public\/storefront\/.+\/media\/a\.webp$/), alt: "Lamp" },
    }]);
  });

  it("leaves out drafts, digital products and stores with nothing for sale", async () => {
    seedPhysicalStore({ status: "draft" });
    seedProduct({ slug: "kit", status: "published" });
    expect(await listStoreCards()).toEqual([]);

    resetFakes();
    seedPhysicalStore({ status: "published" });
    for (const variant of state.product_variants) variant.active = false;
    expect(await listStoreCards()).toEqual([]);
  });
});

describe("cover at a versioned path", () => {
  it("serves the published cover, so next/image can optimise it without a query string", async () => {
    const product = seedProduct({ cover_path: "private/cover.png", cover_type: "image/png" });
    const context = { params: Promise.resolve({ id: product.id, version: String(product.revision) }) };
    const response = await versionedCover(new Request(`https://delivery.example.com/api/products/${product.id}/cover/1`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(storageDownload).toHaveBeenCalledWith("private/cover.png");

    product.status = "draft";
    expect((await versionedCover(new Request(`https://delivery.example.com/api/products/${product.id}/cover/1`), context)).status).toBe(404);
  });
});

describe("homepage photos", () => {
  it("shows only saved photos, at an address that changes when the file does", async () => {
    const root = mkdtempSync(join(tmpdir(), "vc-photos-"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      expect(homePhotos()).toEqual({});
      mkdirSync(join(root, "public", "home"), { recursive: true });
      writeFileSync(join(root, "public", "home", "manager.png"), "first");
      const first = homePhotos().manager!;
      expect(first.src).toMatch(/^\/api\/home-photo\/manager\/[0-9a-f]{16}$/);
      expect(Object.keys(homePhotos())).toEqual(["manager"]);

      const [, , , name, version] = first.src.split("/");
      const response = await photoRoute(new Request(`https://delivery.example.com${first.src}`), { params: Promise.resolve({ name, version }) });
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");
      expect(await response.text()).toBe("first");

      writeFileSync(join(root, "public", "home", "manager.png"), "replaced photo");
      expect(homePhotos().manager!.src).not.toBe(first.src);
      expect(readHomePhoto("manager", version)).toBeNull();
      expect(readHomePhoto("../secrets", version)).toBeNull();
      expect(readHomePhoto("toString", version)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

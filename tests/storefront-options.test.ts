import { describe, expect, it } from "vitest";
import { publicOptions, variantLabel } from "../lib/storefront";

describe("store variant options", () => {
  it("orders colour before size before other options, keeping value order from the variants", () => {
    const options = publicOptions([
      { options: { Size: "M", Material: "Cotton", Color: "Sand" } },
      { options: { Size: "L", Material: "Cotton", Color: "Black" } },
      { options: { Size: "M", Material: "Linen", Color: "Sand" } },
    ]);
    expect(options).toEqual([
      { name: "Color", values: ["Sand", "Black"] },
      { name: "Size", values: ["M", "L"] },
      { name: "Material", values: ["Cotton", "Linen"] },
    ]);
  });

  it("labels a variant in option order and skips empty values", () => {
    expect(variantLabel({ Size: "M", Colour: "Rose" })).toBe("Rose / M");
    expect(variantLabel({ Pack: "Twin", Color: "" }, ["Color", "Pack"])).toBe("Twin");
    expect(publicOptions([{ options: {} }])).toEqual([]);
  });
});

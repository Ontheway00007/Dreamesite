import { describe, expect, it } from "vitest";

import { publicPriceLabel } from "@/lib/properties/display";

describe("publicPriceLabel", () => {
  it("adds a currency sign to a numeric display value", () => {
    expect(publicPriceLabel("699,000")).toBe("$699,000");
  });

  it("preserves authored price copy", () => {
    expect(publicPriceLabel("Price on application")).toBe(
      "Price on application",
    );
    expect(publicPriceLabel("From $780,000")).toBe("From $780,000");
  });

  it("omits blank values", () => {
    expect(publicPriceLabel("   ")).toBeUndefined();
    expect(publicPriceLabel()).toBeUndefined();
  });
});

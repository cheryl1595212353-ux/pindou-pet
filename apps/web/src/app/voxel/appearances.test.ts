import { describe, expect, it } from "vitest";

import {
  CAT_APPEARANCES,
  DEFAULT_CAT_ID,
  getCatAppearance,
  validateAppearance,
} from "./appearances";

describe("cat appearances", () => {
  it("defines five valid unique demo cats", () => {
    expect(CAT_APPEARANCES).toHaveLength(5);
    expect(new Set(CAT_APPEARANCES.map((cat) => cat.id)).size).toBe(5);
    CAT_APPEARANCES.forEach((cat) => expect(() => validateAppearance(cat)).not.toThrow());
  });

  it("falls back to the default cat for an unknown id", () => {
    const result = getCatAppearance("missing-cat");
    expect(result.appearance.id).toBe(DEFAULT_CAT_ID);
    expect(result.didFallback).toBe(true);
  });

  it("keeps every pattern at exactly 8 by 8 pixels", () => {
    for (const cat of CAT_APPEARANCES) {
      for (const pattern of Object.values(cat.patterns)) {
        expect(pattern).toHaveLength(8);
        pattern.forEach((row) => expect(row).toHaveLength(8));
      }
    }
  });
});

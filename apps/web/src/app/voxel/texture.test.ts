import { describe, expect, it } from "vitest";

import { buildTexturePixels } from "./texture";

describe("buildTexturePixels", () => {
  it("expands a pattern deterministically with opaque pixels", () => {
    const palette = {
      base: "#112233",
      secondary: "#445566",
      dark: "#000000",
      light: "#ffffff",
      eye: "#00ff00",
      nose: "#ff8888",
    } as const;
    const pattern = Array.from({ length: 8 }, () => "bbbbbbbb");

    const first = buildTexturePixels(pattern, palette);
    const second = buildTexturePixels(pattern, palette);

    expect(first).toEqual(second);
    expect([...first.slice(0, 4)]).toEqual([0x11, 0x22, 0x33, 0xff]);
    expect(first).toHaveLength(8 * 8 * 4);
  });

  it("maps each legend symbol to its named palette color", () => {
    const palette = {
      base: "#010101",
      secondary: "#020202",
      dark: "#030303",
      light: "#040404",
      eye: "#050505",
      nose: "#060606",
    } as const;
    const pattern = ["bsdlenbs", ...Array.from({ length: 7 }, () => "bbbbbbbb")];

    const pixels = buildTexturePixels(pattern, palette);

    expect([0, 1, 2, 3, 4, 5].map((x) => pixels[x * 4])).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three";

import { PATTERN_LEGEND, type PaletteKey, type PixelPattern } from "./appearances";

function rgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function buildTexturePixels(
  pattern: PixelPattern,
  palette: Readonly<Record<PaletteKey, string>>,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(8 * 8 * 4);

  pattern.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const paletteKey = PATTERN_LEGEND[cell];
      if (paletteKey === undefined) {
        throw new Error(`Unknown texture symbol: ${cell}`);
      }
      const [r, g, b] = rgb(palette[paletteKey]);
      output.set([r, g, b, 255], (y * 8 + x) * 4);
    });
  });

  return output;
}

export function createPixelTexture(
  pattern: PixelPattern,
  palette: Readonly<Record<PaletteKey, string>>,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;

  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D canvas is unavailable for texture generation");
  }

  const imageData = context.createImageData(8, 8);
  imageData.data.set(buildTexturePixels(pattern, palette));
  context.putImageData(imageData, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

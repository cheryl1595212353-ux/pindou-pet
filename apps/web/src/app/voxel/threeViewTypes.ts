export type CatViewName = "front" | "side" | "top";

export interface BinaryMask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface RgbaRaster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface NormalizedCatView extends BinaryMask {
  readonly rgba: Uint8ClampedArray;
  readonly sourceMask: Uint8Array;
}

export interface MaskStroke {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly value: 0 | 1;
}

export interface ShapeCorrections {
  readonly headWidth: number;
  readonly bodyLength: number;
  readonly legLength: number;
  readonly earHeight: number;
  readonly tailThickness: number;
}

export const DEFAULT_SHAPE_CORRECTIONS: ShapeCorrections = {
  headWidth: 1,
  bodyLength: 1,
  legLength: 1,
  earHeight: 1,
  tailThickness: 1,
};


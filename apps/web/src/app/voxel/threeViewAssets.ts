import type { CatAppearance, CatId } from "./appearances";
import { parseHexColor, type Rgb } from "./photoPalette";
import {
  extractForegroundMask,
  indexOf,
  loadImageRgba,
  normalizeCatView,
} from "./threeViewRaster";
import type {
  CatViewName,
  NormalizedCatView,
  RgbaRaster,
} from "./threeViewTypes";
import type { TailProfile } from "./visualHull";

export interface CatThreeViewAsset {
  readonly paths: Readonly<Record<CatViewName, string>>;
  readonly topHeadAt: "start" | "end";
  readonly fallbackTail: Readonly<Pick<TailProfile, "lengthRatio" | "thicknessRatio">>;
}

function asset(id: CatId, topHeadAt: CatThreeViewAsset["topHeadAt"], fallbackTail: CatThreeViewAsset["fallbackTail"]): CatThreeViewAsset {
  return {
    paths: {
      front: `/demo-cats/${id}/front.png`,
      side: `/demo-cats/${id}/side.png`,
      top: `/demo-cats/${id}/top.png`,
    },
    topHeadAt,
    fallbackTail,
  };
}

export const CAT_THREE_VIEW_ASSETS: Readonly<Record<CatId, CatThreeViewAsset>> = {
  "cat-01": asset("cat-01", "start", { lengthRatio: 0.38, thicknessRatio: 0.12 }),
  "cat-02": asset("cat-02", "start", { lengthRatio: 0.5, thicknessRatio: 0.18 }),
  "cat-03": asset("cat-03", "end", { lengthRatio: 0.42, thicknessRatio: 0.11 }),
  "cat-04": asset("cat-04", "end", { lengthRatio: 0.4, thicknessRatio: 0.2 }),
  "cat-05": asset("cat-05", "end", { lengthRatio: 0.58, thicknessRatio: 0.3 }),
};

export interface LoadedCatViews {
  readonly views: Readonly<Record<CatViewName, NormalizedCatView>>;
  readonly tailProfile: TailProfile;
}

export type RasterLoader = (url: string) => Promise<RgbaRaster>;
export type CatViewLoader = (catId: CatId, appearance: CatAppearance) => Promise<LoadedCatViews>;

export function findCoreAxisRange(counts: readonly number[], thresholdRatio: number): readonly [number, number] {
  const threshold = Math.max(1, Math.max(...counts) * thresholdRatio);
  let bestStart = 0;
  let bestEnd = -1;
  let currentStart = -1;
  for (let index = 0; index <= counts.length; index += 1) {
    const active = index < counts.length && (counts[index] ?? 0) >= threshold;
    if (active && currentStart < 0) currentStart = index;
    if (active) continue;
    if (currentStart >= 0 && index - 1 - currentStart > bestEnd - bestStart) {
      bestStart = currentStart;
      bestEnd = index - 1;
    }
    currentStart = -1;
  }
  if (bestEnd < bestStart) throw new Error("Unable to locate cat body core");
  return [bestStart, bestEnd];
}

function axisCounts(mask: ReturnType<typeof extractForegroundMask>, view: CatViewName): number[] {
  const axisLength = view === "top" ? mask.height : mask.width;
  const counts = new Array<number>(axisLength).fill(0);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[indexOf(mask, x, y)] === 0) continue;
      counts[view === "top" ? y : x] = (counts[view === "top" ? y : x] ?? 0) + 1;
    }
  }
  return counts;
}

function isolateBodyRaster(raster: RgbaRaster, view: CatViewName): RgbaRaster {
  const mask = extractForegroundMask(raster);
  const ratios: Readonly<Record<CatViewName, number>> = { front: 0.3, side: 0.36, top: 0.42 };
  const counts = axisCounts(mask, view);
  const [rawStart, rawEnd] = findCoreAxisRange(counts, ratios[view]);
  const margin = Math.max(1, Math.round(counts.length * 0.035));
  const start = Math.max(0, rawStart - margin);
  const end = Math.min(counts.length - 1, rawEnd + margin);
  const data = raster.data.slice();
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const axis = view === "top" ? y : x;
      if (axis >= start && axis <= end) continue;
      const offset = indexOf(raster, x, y) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
  }
  return { width: raster.width, height: raster.height, data };
}

function averageTailColor(
  raster: RgbaRaster,
  mask: ReturnType<typeof extractForegroundMask>,
  start: number,
  end: number,
  fallback: Rgb,
): string {
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  for (let y = Math.max(0, start); y <= Math.min(mask.height - 1, end); y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const cell = indexOf(mask, x, y);
      if (mask.data[cell] === 0) continue;
      const offset = cell * 4;
      red += raster.data[offset] ?? fallback[0];
      green += raster.data[offset + 1] ?? fallback[1];
      blue += raster.data[offset + 2] ?? fallback[2];
      samples += 1;
    }
  }
  const color = samples === 0 ? fallback : [red / samples, green / samples, blue / samples] as const;
  return `#${color.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function estimateTailProfile(
  raster: RgbaRaster,
  assetConfig: CatThreeViewAsset,
  appearance: CatAppearance,
): TailProfile {
  const mask = extractForegroundMask(raster);
  const counts = axisCounts(mask, "top");
  const [coreStart, coreEnd] = findCoreAxisRange(counts, 0.42);
  const coreLength = coreEnd - coreStart + 1;
  const tailStart = assetConfig.topHeadAt === "start" ? coreEnd + 1 : 0;
  const tailEnd = assetConfig.topHeadAt === "start" ? counts.length - 1 : coreStart - 1;
  const nonemptyTail = counts
    .map((count, index) => ({ count, index }))
    .filter(({ count, index }) => count > 0 && index >= tailStart && index <= tailEnd);
  const extension = nonemptyTail.length === 0
    ? 0
    : Math.max(...nonemptyTail.map(({ index }) => index)) - Math.min(...nonemptyTail.map(({ index }) => index)) + 1;
  const maxWidth = Math.max(...counts, 1);
  const averageWidth = nonemptyTail.length === 0
    ? 0
    : nonemptyTail.reduce((sum, item) => sum + item.count, 0) / nonemptyTail.length;
  const measuredLength = extension / Math.max(1, coreLength);
  const measuredThickness = averageWidth / maxWidth;
  const lengthRatio = measuredLength > 0.18
    ? Math.max(0.25, Math.min(0.75, measuredLength))
    : assetConfig.fallbackTail.lengthRatio;
  const thicknessRatio = measuredThickness > 0.06
    ? Math.max(0.09, Math.min(0.34, measuredThickness))
    : assetConfig.fallbackTail.thicknessRatio;
  const fallback = parseHexColor(appearance.palette.dark);
  return {
    lengthRatio,
    thicknessRatio,
    color: averageTailColor(raster, mask, tailStart, tailEnd, fallback),
  };
}

async function buildLoadedViews(
  catId: CatId,
  appearance: CatAppearance,
  loadRaster: RasterLoader,
): Promise<LoadedCatViews> {
  const config = CAT_THREE_VIEW_ASSETS[catId];
  const [frontRaster, sideRaster, topRaster] = await Promise.all([
    loadRaster(config.paths.front),
    loadRaster(config.paths.side),
    loadRaster(config.paths.top),
  ]);
  const views = {
    front: normalizeCatView(isolateBodyRaster(frontRaster, "front"), { width: 24, height: 48 }),
    side: normalizeCatView(isolateBodyRaster(sideRaster, "side"), { width: 56, height: 48 }),
    top: normalizeCatView(
      isolateBodyRaster(topRaster, "top"),
      { width: 24, height: 56 },
      config.topHeadAt === "start",
    ),
  } satisfies Readonly<Record<CatViewName, NormalizedCatView>>;
  return { views, tailProfile: estimateTailProfile(topRaster, config, appearance) };
}

export function createCachedCatViewLoader(loadRaster: RasterLoader = loadImageRgba): CatViewLoader {
  const cache = new Map<CatId, Promise<LoadedCatViews>>();
  return (catId, appearance) => {
    const existing = cache.get(catId);
    if (existing !== undefined) return existing;
    const pending = buildLoadedViews(catId, appearance, loadRaster).catch((error: unknown) => {
      cache.delete(catId);
      throw error;
    });
    cache.set(catId, pending);
    return pending;
  };
}

export const loadNormalizedCatViews = createCachedCatViewLoader();


import type { CatAppearance } from "./appearances";
import {
  nearestPaletteColor,
  parseHexColor,
  quantizePhotoPalette,
  type Rgb,
} from "./photoPalette";
import { dilateMask, indexOf } from "./threeViewRaster";
import type {
  CatViewName,
  NormalizedCatView,
  ShapeCorrections,
} from "./threeViewTypes";

type Grid3 = readonly [number, number, number];
type Vec3 = readonly [number, number, number];

const VOXEL_STEP = 0.1;
const NEIGHBORS: readonly Grid3[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export const DETAILED_RESOLUTION = { length: 56, height: 48, width: 24 } as const;
export const PERFORMANCE_RESOLUTION = { length: 36, height: 32, width: 16 } as const;

export interface VoxelResolution {
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

export interface TailProfile {
  readonly lengthRatio: number;
  readonly thicknessRatio: number;
  readonly color: string;
}

export interface PersonalizedVoxelCell {
  readonly grid: Grid3;
  readonly position: Vec3;
  readonly color: string;
}

export interface ModelAnchors {
  readonly faceX: number;
  readonly eyeY: number;
  readonly eyeZ: number;
  readonly noseY: number;
  readonly tailPivot: Vec3;
  readonly tailNextPivotX: number;
}

export interface PersonalizedVoxelModel {
  readonly main: readonly PersonalizedVoxelCell[];
  readonly tailSegment: readonly PersonalizedVoxelCell[];
  readonly anchors: ModelAnchors;
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly palette: readonly string[];
}

export function gridCellKey([x, y, z]: Grid3): string {
  return `${x}:${y}:${z}`;
}

function scaleIndex(value: number, sourceSize: number, targetSize: number): number {
  if (targetSize <= 1 || sourceSize <= 1) return 0;
  return Math.max(0, Math.min(sourceSize - 1, Math.round((value / (targetSize - 1)) * (sourceSize - 1))));
}

function viewCoordinates(
  view: CatViewName,
  grid: Grid3,
  resolution: VoxelResolution,
  target: NormalizedCatView,
): readonly [number, number] {
  const [x, y, z] = grid;
  if (view === "front") {
    return [scaleIndex(z, target.width, resolution.width), target.height - 1 - scaleIndex(y, target.height, resolution.height)];
  }
  if (view === "side") {
    return [scaleIndex(x, target.width, resolution.length), target.height - 1 - scaleIndex(y, target.height, resolution.height)];
  }
  return [scaleIndex(z, target.width, resolution.width), target.height - 1 - scaleIndex(x, target.height, resolution.length)];
}

function isInside(view: NormalizedCatView, coordinates: readonly [number, number]): boolean {
  return view.data[indexOf(view, coordinates[0], coordinates[1])] !== 0;
}

function largestComponent(cells: readonly Grid3[]): readonly Grid3[] {
  const byKey = new Map(cells.map((cell) => [gridCellKey(cell), cell]));
  const unseen = new Set(byKey.keys());
  let largest: Grid3[] = [];

  while (unseen.size > 0) {
    const start = unseen.values().next().value as string | undefined;
    if (start === undefined) break;
    const queue = [start];
    const component: Grid3[] = [];
    unseen.delete(start);
    while (queue.length > 0) {
      const key = queue.pop();
      if (key === undefined) break;
      const cell = byKey.get(key);
      if (cell === undefined) continue;
      component.push(cell);
      for (const [dx, dy, dz] of NEIGHBORS) {
        const neighbor = gridCellKey([cell[0] + dx, cell[1] + dy, cell[2] + dz]);
        if (!unseen.has(neighbor)) continue;
        unseen.delete(neighbor);
        queue.push(neighbor);
      }
    }
    if (component.length > largest.length) largest = component;
  }
  return largest;
}

function surfaceOnly(cells: readonly Grid3[]): readonly Grid3[] {
  const occupied = new Set(cells.map(gridCellKey));
  return cells.filter((cell) => NEIGHBORS.some(([dx, dy, dz]) =>
    !occupied.has(gridCellKey([cell[0] + dx, cell[1] + dy, cell[2] + dz])),
  ));
}

function foregroundPixels(views: Readonly<Record<CatViewName, NormalizedCatView>>): Rgb[] {
  const pixels: Rgb[] = [];
  for (const view of Object.values(views)) {
    for (let cell = 0; cell < view.sourceMask.length; cell += 1) {
      if (view.sourceMask[cell] === 0) continue;
      const offset = cell * 4;
      pixels.push([view.rgba[offset] ?? 255, view.rgba[offset + 1] ?? 255, view.rgba[offset + 2] ?? 255]);
    }
  }
  return pixels;
}

function sampleViewColor(
  view: NormalizedCatView,
  coordinates: readonly [number, number],
  fallback: Rgb,
): Rgb {
  const [x, y] = coordinates;
  for (let radius = 0; radius <= 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const sampleX = x + dx;
        const sampleY = y + dy;
        if (sampleX < 0 || sampleY < 0 || sampleX >= view.width || sampleY >= view.height) continue;
        const cell = indexOf(view, sampleX, sampleY);
        if (view.sourceMask[cell] === 0) continue;
        const offset = cell * 4;
        return [view.rgba[offset] ?? fallback[0], view.rgba[offset + 1] ?? fallback[1], view.rgba[offset + 2] ?? fallback[2]];
      }
    }
  }
  return fallback;
}

function correctedPosition(
  grid: Grid3,
  resolution: VoxelResolution,
  corrections: ShapeCorrections,
): Vec3 {
  const [x, y, z] = grid;
  const centerX = (resolution.length - 1) / 2;
  const centerZ = (resolution.width - 1) / 2;
  let worldX = (x - centerX) * VOXEL_STEP * corrections.bodyLength;
  let worldZ = (z - centerZ) * VOXEL_STEP;
  const legLimit = (resolution.height - 1) * 0.32;
  let correctedY = y <= legLimit
    ? y * corrections.legLength
    : y + legLimit * (corrections.legLength - 1);
  const headRegion = x < resolution.length * 0.35 && y > resolution.height * 0.5;
  if (headRegion) worldZ *= corrections.headWidth;
  const earBase = (resolution.height - 1) * 0.84;
  if (headRegion && y > earBase) {
    correctedY = earBase + (correctedY - earBase) * corrections.earHeight;
  }
  worldX = Number(worldX.toFixed(4));
  worldZ = Number(worldZ.toFixed(4));
  return [worldX, Number((correctedY * VOXEL_STEP).toFixed(4)), worldZ];
}

function boundsOf(cells: readonly PersonalizedVoxelCell[]): PersonalizedVoxelModel["bounds"] {
  const axes = [0, 1, 2] as const;
  const min = axes.map((axis) => Math.min(...cells.map((cell) => cell.position[axis]))) as unknown as Vec3;
  const max = axes.map((axis) => Math.max(...cells.map((cell) => cell.position[axis]))) as unknown as Vec3;
  return { min, max };
}

function tailCells(
  resolution: VoxelResolution,
  profile: TailProfile,
  corrections: ShapeCorrections,
  palette: readonly string[],
): { readonly cells: readonly PersonalizedVoxelCell[]; readonly nextPivotX: number } {
  const totalLength = Math.max(9, Math.min(36, Math.round(resolution.length * profile.lengthRatio)));
  const segmentLength = Math.max(3, Math.round(totalLength / 3));
  const thickness = Math.max(2, Math.min(7, Math.round(resolution.width * profile.thicknessRatio * corrections.tailThickness)));
  const occupied: Grid3[] = [];
  for (let x = 0; x < segmentLength; x += 1) {
    for (let y = 0; y < thickness; y += 1) {
      for (let z = 0; z < thickness; z += 1) occupied.push([x, y, z]);
    }
  }
  const color = nearestPaletteColor(parseHexColor(profile.color), palette);
  const center = (thickness - 1) / 2;
  const cells = surfaceOnly(occupied).map((grid) => ({
    grid,
    position: [grid[0] * VOXEL_STEP, (grid[1] - center) * VOXEL_STEP, (grid[2] - center) * VOXEL_STEP] as Vec3,
    color,
  }));
  return { cells, nextPivotX: segmentLength * VOXEL_STEP };
}

export function buildPersonalizedVoxelModel(args: {
  readonly views: Readonly<Record<CatViewName, NormalizedCatView>>;
  readonly appearance: CatAppearance;
  readonly corrections: ShapeCorrections;
  readonly resolution: VoxelResolution;
  readonly tailProfile: TailProfile;
}): PersonalizedVoxelModel {
  const { views, appearance, corrections, resolution, tailProfile } = args;
  const expanded = {
    front: { ...views.front, data: dilateMask(views.front, 1).data },
    side: { ...views.side, data: dilateMask(views.side, 1).data },
    top: { ...views.top, data: dilateMask(views.top, 1).data },
  } satisfies Readonly<Record<CatViewName, NormalizedCatView>>;
  const occupied: Grid3[] = [];
  for (let x = 0; x < resolution.length; x += 1) {
    for (let y = 0; y < resolution.height; y += 1) {
      for (let z = 0; z < resolution.width; z += 1) {
        const grid: Grid3 = [x, y, z];
        if ((["front", "side", "top"] as const).every((name) =>
          isInside(expanded[name], viewCoordinates(name, grid, resolution, expanded[name])),
        )) occupied.push(grid);
      }
    }
  }
  const connected = largestComponent(occupied);
  const surface = surfaceOnly(connected);
  if (surface.length < 400 || surface.length > 20_000) {
    throw new Error(`Personalized voxel surface outside safe range: ${surface.length}`);
  }

  const paletteSource = foregroundPixels(views);
  if (paletteSource.length === 0) paletteSource.push(parseHexColor(appearance.palette.base));
  const palette = quantizePhotoPalette(paletteSource, 16);
  const occupiedSet = new Set(connected.map(gridCellKey));
  const fallback = parseHexColor(appearance.palette.base);
  const main = surface.map((grid): PersonalizedVoxelCell => {
    const [x, y, z] = grid;
    let view: CatViewName = "side";
    if (!occupiedSet.has(gridCellKey([x - 1, y, z]))) view = "front";
    else if (!occupiedSet.has(gridCellKey([x, y + 1, z]))) view = "top";
    const sample = sampleViewColor(views[view], viewCoordinates(view, grid, resolution, views[view]), fallback);
    return { grid, position: correctedPosition(grid, resolution, corrections), color: nearestPaletteColor(sample, palette) };
  });
  const bounds = boundsOf(main);
  const tail = tailCells(resolution, tailProfile, corrections, palette);
  const height = bounds.max[1] - bounds.min[1];
  const width = bounds.max[2] - bounds.min[2];
  const anchors: ModelAnchors = {
    faceX: bounds.min[0] - VOXEL_STEP * 0.55,
    eyeY: bounds.min[1] + height * 0.73,
    eyeZ: Math.max(0.22, width * 0.22),
    noseY: bounds.min[1] + height * 0.62,
    tailPivot: [bounds.max[0] + VOXEL_STEP * 0.5, bounds.min[1] + height * 0.52, 0],
    tailNextPivotX: tail.nextPivotX,
  };

  return { main, tailSegment: tail.cells, anchors, bounds, palette };
}

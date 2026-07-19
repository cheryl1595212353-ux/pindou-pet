import {
  PATTERN_LEGEND,
  type CatAppearance,
  type PaletteKey,
} from "./appearances";

type Vec3 = readonly [number, number, number];
type PatternName = keyof CatAppearance["patterns"];

export type VoxelRegion =
  | "body"
  | "head"
  | "muzzle"
  | "ear"
  | "leg"
  | "paw"
  | "chest"
  | "tail";

export const VOXEL_STEP = 0.1;
export const VOXEL_CUBE_SIZE = VOXEL_STEP * 0.94;
export const GRID_NEIGHBORS: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface VoxelCell {
  readonly grid: Vec3;
  readonly position: Vec3;
  readonly region: VoxelRegion;
  readonly pattern: PatternName;
  readonly patternCell: readonly [number, number];
  readonly paletteOverride?: PaletteKey;
}

export interface HighDensityVoxelModel {
  readonly main: readonly VoxelCell[];
  readonly tailSegment: readonly VoxelCell[];
}

interface Shape {
  readonly region: VoxelRegion;
  readonly pattern: PatternName;
  readonly bounds: readonly [number, number, number, number, number, number];
  readonly paletteOverride?: PaletteKey;
  readonly contains: (x: number, y: number, z: number) => boolean;
}

export function gridKey([x, y, z]: Vec3): string {
  return `${x}:${y}:${z}`;
}

function box(
  x: number,
  y: number,
  z: number,
  bounds: Shape["bounds"],
): boolean {
  const [minX, maxX, minY, maxY, minZ, maxZ] = bounds;
  return (
    x >= minX &&
    x <= maxX &&
    y >= minY &&
    y <= maxY &&
    z >= minZ &&
    z <= maxZ
  );
}

function chamferedBox(
  x: number,
  y: number,
  z: number,
  bounds: Shape["bounds"],
  cut: number,
): boolean {
  if (!box(x, y, z, bounds)) return false;

  const [minX, maxX, minY, maxY, minZ, maxZ] = bounds;
  const edgeX = Math.min(x - minX, maxX - x);
  const edgeY = Math.min(y - minY, maxY - y);
  const edgeZ = Math.min(z - minZ, maxZ - z);
  return (
    edgeX + edgeY >= cut &&
    edgeX + edgeZ >= cut &&
    edgeY + edgeZ >= cut
  );
}

function earContains(centerZ: number) {
  return (x: number, y: number, z: number): boolean => {
    if (y < 41 || y > 50) return false;

    const level = y - 41;
    const halfX = Math.max(1, 5 - Math.floor(level / 3));
    const halfZ = Math.max(1, 5 - Math.floor(level / 2));
    return Math.abs(x + 25) <= halfX && Math.abs(z - centerZ) <= halfZ;
  };
}

function makeShapes(): readonly Shape[] {
  const shapes: Shape[] = [
    {
      region: "muzzle",
      pattern: "face",
      bounds: [-41, -36, 26, 33, -6, 6],
      paletteOverride: "light",
      contains: (x, y, z) =>
        chamferedBox(x, y, z, [-41, -36, 26, 33, -6, 6], 1),
    },
    {
      region: "muzzle",
      pattern: "face",
      bounds: [-39, -35, 28, 35, -9, -2],
      paletteOverride: "light",
      contains: (x, y, z) =>
        chamferedBox(x, y, z, [-39, -35, 28, 35, -9, -2], 1),
    },
    {
      region: "muzzle",
      pattern: "face",
      bounds: [-39, -35, 28, 35, 2, 9],
      paletteOverride: "light",
      contains: (x, y, z) =>
        chamferedBox(x, y, z, [-39, -35, 28, 35, 2, 9], 1),
    },
    {
      region: "ear",
      pattern: "face",
      bounds: [-30, -20, 41, 50, -11, -1],
      contains: earContains(-6),
    },
    {
      region: "ear",
      pattern: "face",
      bounds: [-30, -20, 41, 50, 1, 11],
      contains: earContains(6),
    },
    {
      region: "head",
      pattern: "face",
      bounds: [-37, -14, 21, 43, -11, 11],
      contains: (x, y, z) =>
        chamferedBox(x, y, z, [-37, -14, 21, 43, -11, 11], 2),
    },
    {
      region: "chest",
      pattern: "body",
      bounds: [-22, -18, 15, 29, -7, 7],
      paletteOverride: "light",
      contains: (x, y, z) =>
        chamferedBox(x, y, z, [-22, -18, 15, 29, -7, 7], 1),
    },
    {
      region: "body",
      pattern: "body",
      bounds: [-20, 19, 13, 36, -11, 11],
      contains: (x, y, z) =>
        chamferedBox(x, y, z, [-20, 19, 13, 36, -11, 11], 2),
    },
    {
      region: "chest",
      pattern: "body",
      bounds: [-8, 12, 10, 16, -8, 8],
      paletteOverride: "light",
      contains: (x, y, z) =>
        chamferedBox(x, y, z, [-8, 12, 10, 16, -8, 8], 2),
    },
  ];

  for (const centerX of [-13, 13]) {
    for (const centerZ of [-6, 6]) {
      const pawBounds = [
        centerX - 6,
        centerX + 4,
        1,
        6,
        centerZ - 5,
        centerZ + 5,
      ] as const;
      const legBounds = [
        centerX - 4,
        centerX + 4,
        4,
        18,
        centerZ - 4,
        centerZ + 4,
      ] as const;
      shapes.push(
        {
          region: "paw",
          pattern: "legs",
          bounds: pawBounds,
          paletteOverride: "light",
          contains: (x, y, z) => chamferedBox(x, y, z, pawBounds, 1),
        },
        {
          region: "leg",
          pattern: "legs",
          bounds: legBounds,
          contains: (x, y, z) => chamferedBox(x, y, z, legBounds, 1),
        },
      );
    }
  }

  return shapes;
}

function patternCell(
  shape: Shape,
  x: number,
  y: number,
  z: number,
): readonly [number, number] {
  const [minX, maxX, minY, maxY, minZ, maxZ] = shape.bounds;
  const coordinateU = shape.pattern === "face" ? z : x;
  const minU = shape.pattern === "face" ? minZ : minX;
  const maxU = shape.pattern === "face" ? maxZ : maxX;
  const u = Math.round(((coordinateU - minU) / Math.max(1, maxU - minU)) * 7);
  const v =
    7 - Math.round(((y - minY) / Math.max(1, maxY - minY)) * 7);
  return [
    Math.max(0, Math.min(7, u)),
    Math.max(0, Math.min(7, v)),
  ];
}

function toCell(shape: Shape, x: number, y: number, z: number): VoxelCell {
  return {
    grid: [x, y, z],
    position: [x * VOXEL_STEP, y * VOXEL_STEP, z * VOXEL_STEP],
    region: shape.region,
    pattern: shape.pattern,
    patternCell: patternCell(shape, x, y, z),
    ...(shape.paletteOverride === undefined
      ? {}
      : { paletteOverride: shape.paletteOverride }),
  };
}

function surfaceOnly(cells: readonly VoxelCell[]): readonly VoxelCell[] {
  const occupied = new Set(cells.map((cell) => gridKey(cell.grid)));
  return cells.filter((cell) =>
    GRID_NEIGHBORS.some(
      ([dx, dy, dz]) =>
        !occupied.has(
          gridKey([
            cell.grid[0] + dx,
            cell.grid[1] + dy,
            cell.grid[2] + dz,
          ]),
        ),
    ),
  );
}

function generateMain(): readonly VoxelCell[] {
  const shapes = makeShapes();
  const occupied = new Map<string, VoxelCell>();

  for (let x = -41; x <= 19; x += 1) {
    for (let y = 1; y <= 50; y += 1) {
      for (let z = -11; z <= 11; z += 1) {
        const shape = shapes.find((candidate) => candidate.contains(x, y, z));
        if (shape !== undefined) {
          occupied.set(gridKey([x, y, z]), toCell(shape, x, y, z));
        }
      }
    }
  }

  return surfaceOnly([...occupied.values()]);
}

function generateTailSegment(): readonly VoxelCell[] {
  const bounds = [0, 15, -3, 3, -3, 3] as const;
  const shape: Shape = {
    region: "tail",
    pattern: "tail",
    bounds,
    contains: (x, y, z) => chamferedBox(x, y, z, bounds, 1),
  };
  const cells: VoxelCell[] = [];

  for (let x = 0; x <= 15; x += 1) {
    for (let y = -3; y <= 3; y += 1) {
      for (let z = -3; z <= 3; z += 1) {
        if (shape.contains(x, y, z)) cells.push(toCell(shape, x, y, z));
      }
    }
  }

  return surfaceOnly(cells);
}

export function generateHighDensityVoxelModel(): HighDensityVoxelModel {
  return {
    main: generateMain(),
    tailSegment: generateTailSegment(),
  };
}

export function resolveVoxelPaletteKey(
  cell: VoxelCell,
  appearance: CatAppearance,
): PaletteKey {
  if (cell.paletteOverride !== undefined) return cell.paletteOverride;

  const [u, v] = cell.patternCell;
  const symbol = appearance.patterns[cell.pattern][v]?.[u];
  const paletteKey = symbol === undefined ? undefined : PATTERN_LEGEND[symbol];
  if (paletteKey === undefined) {
    throw new Error(`Unknown voxel pattern at ${gridKey(cell.grid)}`);
  }
  return paletteKey;
}

export const HIGH_DENSITY_VOXEL_MODEL = generateHighDensityVoxelModel();
export const HIGH_DENSITY_VOXEL_COUNT =
  HIGH_DENSITY_VOXEL_MODEL.main.length +
  HIGH_DENSITY_VOXEL_MODEL.tailSegment.length * 3;

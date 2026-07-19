import type {
  BinaryMask,
  MaskStroke,
  NormalizedCatView,
  RgbaRaster,
} from "./threeViewTypes";

export type {
  BinaryMask,
  MaskStroke,
  NormalizedCatView,
  RgbaRaster,
} from "./threeViewTypes";

type Point = readonly [number, number];

const CARDINAL_AND_DIAGONAL: readonly Point[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function indexOf(mask: Pick<BinaryMask, "width">, x: number, y: number): number {
  return y * mask.width + x;
}

export function countMask(mask: BinaryMask): number {
  let count = 0;
  for (const value of mask.data) count += value === 0 ? 0 : 1;
  return count;
}

function quantile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(Math.max(0, sorted.length - 1) * ratio)] ?? 255;
}

function estimateBackground(raster: RgbaRaster): readonly [number, number, number] {
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (x !== 0 && y !== 0 && x !== raster.width - 1 && y !== raster.height - 1) continue;
      const offset = indexOf(raster, x, y) * 4;
      channels[0].push(raster.data[offset] ?? 255);
      channels[1].push(raster.data[offset + 1] ?? 255);
      channels[2].push(raster.data[offset + 2] ?? 255);
    }
  }
  return [
    quantile(channels[0], 0.9),
    quantile(channels[1], 0.9),
    quantile(channels[2], 0.9),
  ];
}

function components(mask: BinaryMask): readonly number[][] {
  const visited = new Uint8Array(mask.data.length);
  const result: number[][] = [];

  for (let start = 0; start < mask.data.length; start += 1) {
    if (mask.data[start] === 0 || visited[start] === 1) continue;
    const queue = [start];
    const component: number[] = [];
    visited[start] = 1;

    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) break;
      component.push(current);
      const x = current % mask.width;
      const y = Math.floor(current / mask.width);
      for (const [dx, dy] of CARDINAL_AND_DIAGONAL) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= mask.width || nextY >= mask.height) continue;
        const next = indexOf(mask, nextX, nextY);
        if (mask.data[next] === 0 || visited[next] === 1) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    result.push(component);
  }
  return result;
}

function keepLargestComponent(mask: BinaryMask): BinaryMask {
  const largest = [...components(mask)].sort((a, b) => b.length - a.length)[0] ?? [];
  const data = new Uint8Array(mask.data.length);
  for (const cell of largest) data[cell] = 1;
  return { width: mask.width, height: mask.height, data };
}

function removeHorizontalWisps(mask: BinaryMask): BinaryMask {
  const data = mask.data.slice();
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const cell = indexOf(mask, x, y);
      if (mask.data[cell] === 0) continue;
      let verticallySupported = false;
      for (let dy = -1; dy <= 1 && !verticallySupported; dy += 2) {
        const supportY = y + dy;
        if (supportY < 0 || supportY >= mask.height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const supportX = x + dx;
          if (supportX < 0 || supportX >= mask.width) continue;
          if (mask.data[indexOf(mask, supportX, supportY)] !== 0) {
            verticallySupported = true;
            break;
          }
        }
      }
      if (!verticallySupported) data[cell] = 0;
    }
  }
  return { width: mask.width, height: mask.height, data };
}

function trimUnsupportedBottomBand(mask: BinaryMask): BinaryMask {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  const rowCounts = new Array<number>(mask.height).fill(0);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[indexOf(mask, x, y)] !== 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = y;
        rowCounts[y] = (rowCounts[y] ?? 0) + 1;
      }
    }
  }
  if (maxX < minX || maxY < minY) return mask;

  const subjectWidth = maxX - minX + 1;
  const broadRowThreshold = Math.max(3, subjectWidth * 0.5);
  let bandStart = maxY + 1;
  for (let y = maxY; y >= minY; y -= 1) {
    if ((rowCounts[y] ?? 0) < broadRowThreshold) break;
    bandStart = y;
  }
  const supportY = bandStart - 1;
  if (bandStart > maxY || supportY < minY) return mask;

  const data = mask.data.slice();
  for (let y = bandStart; y <= maxY; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const cell = indexOf(mask, x, y);
      if (mask.data[cell] === 0) continue;
      let supported = false;
      for (let dx = -1; dx <= 1; dx += 1) {
        const supportX = x + dx;
        if (supportX < 0 || supportX >= mask.width) continue;
        if (mask.data[indexOf(mask, supportX, supportY)] !== 0) {
          supported = true;
          break;
        }
      }
      if (!supported) data[cell] = 0;
    }
  }
  return { width: mask.width, height: mask.height, data };
}

function erodeVertically(mask: BinaryMask, radius: number): BinaryMask {
  const data = new Uint8Array(mask.data.length);
  for (let y = radius; y < mask.height - radius; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      let filled = true;
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (mask.data[indexOf(mask, x, y + dy)] === 0) {
          filled = false;
          break;
        }
      }
      if (filled) data[indexOf(mask, x, y)] = 1;
    }
  }
  return { width: mask.width, height: mask.height, data };
}

function dilateVertically(mask: BinaryMask, radius: number): BinaryMask {
  const data = new Uint8Array(mask.data.length);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sourceY = y + dy;
        if (sourceY < 0 || sourceY >= mask.height) continue;
        if (mask.data[indexOf(mask, x, sourceY)] !== 0) {
          data[indexOf(mask, x, y)] = 1;
          break;
        }
      }
    }
  }
  return { width: mask.width, height: mask.height, data };
}

export function dilateMask(mask: BinaryMask, radius = 1): BinaryMask {
  const data = new Uint8Array(mask.data.length);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      let filled = false;
      for (let dy = -radius; dy <= radius && !filled; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sourceX = x + dx;
          const sourceY = y + dy;
          if (sourceX < 0 || sourceY < 0 || sourceX >= mask.width || sourceY >= mask.height) continue;
          if (mask.data[indexOf(mask, sourceX, sourceY)] !== 0) {
            filled = true;
            break;
          }
        }
      }
      if (filled) data[indexOf(mask, x, y)] = 1;
    }
  }
  return { width: mask.width, height: mask.height, data };
}

function erodeMask(mask: BinaryMask, radius = 1): BinaryMask {
  const data = new Uint8Array(mask.data.length);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      let filled = true;
      for (let dy = -radius; dy <= radius && filled; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sourceX = x + dx;
          const sourceY = y + dy;
          if (
            sourceX < 0 || sourceY < 0 || sourceX >= mask.width || sourceY >= mask.height ||
            mask.data[indexOf(mask, sourceX, sourceY)] === 0
          ) {
            filled = false;
            break;
          }
        }
      }
      if (filled) data[indexOf(mask, x, y)] = 1;
    }
  }
  return { width: mask.width, height: mask.height, data };
}

function fillHoles(mask: BinaryMask): BinaryMask {
  const outside = new Uint8Array(mask.data.length);
  const queue: number[] = [];
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (x !== 0 && y !== 0 && x !== mask.width - 1 && y !== mask.height - 1) continue;
      const cell = indexOf(mask, x, y);
      if (mask.data[cell] === 0 && outside[cell] === 0) {
        outside[cell] = 1;
        queue.push(cell);
      }
    }
  }

  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    const x = current % mask.width;
    const y = Math.floor(current / mask.width);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= mask.width || nextY >= mask.height) continue;
      const next = indexOf(mask, nextX, nextY);
      if (mask.data[next] !== 0 || outside[next] !== 0) continue;
      outside[next] = 1;
      queue.push(next);
    }
  }

  const data = new Uint8Array(mask.data.length);
  for (let cell = 0; cell < data.length; cell += 1) {
    data[cell] = mask.data[cell] !== 0 || outside[cell] === 0 ? 1 : 0;
  }
  return { width: mask.width, height: mask.height, data };
}

export function extractForegroundMask(raster: RgbaRaster): BinaryMask {
  const background = estimateBackground(raster);
  const weak = new Uint8Array(raster.width * raster.height);
  const strong = new Uint8Array(weak.length);

  for (let cell = 0; cell < weak.length; cell += 1) {
    const offset = cell * 4;
    const red = raster.data[offset] ?? 255;
    const green = raster.data[offset + 1] ?? 255;
    const blue = raster.data[offset + 2] ?? 255;
    const distance = Math.max(
      Math.abs(red - background[0]),
      Math.abs(green - background[1]),
      Math.abs(blue - background[2]),
    );
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (distance >= 14 || luminance < 236 || chroma >= 10) weak[cell] = 1;
    if (distance >= 30 || luminance < 215 || chroma >= 24) strong[cell] = 1;
  }

  const candidates = components({ width: raster.width, height: raster.height, data: weak })
    .filter((component) => component.some((cell) => strong[cell] === 1));
  const subject = candidates.sort((a, b) => b.length - a.length)[0] ?? [];
  const subjectData = new Uint8Array(weak.length);
  for (const cell of subject) subjectData[cell] = 1;

  const subjectMask = { width: raster.width, height: raster.height, data: subjectData };
  const bottomTrimmed = trimUnsupportedBottomBand(subjectMask);
  const verticallyOpened = dilateVertically(erodeVertically(bottomTrimmed, 2), 2);
  const pruned = removeHorizontalWisps(verticallyOpened);
  const closed = erodeMask(dilateMask(pruned, 1), 1);
  return keepLargestComponent(fillHoles(closed));
}

export function paintMask(mask: BinaryMask, stroke: MaskStroke): BinaryMask {
  const data = mask.data.slice();
  const radius = Math.max(0, Math.floor(stroke.radius));
  for (let y = stroke.y - radius; y <= stroke.y + radius; y += 1) {
    for (let x = stroke.x - radius; x <= stroke.x + radius; x += 1) {
      if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue;
      if ((x - stroke.x) ** 2 + (y - stroke.y) ** 2 > radius ** 2) continue;
      data[indexOf(mask, x, y)] = stroke.value;
    }
  }
  return { width: mask.width, height: mask.height, data };
}

function foregroundBounds(mask: BinaryMask): readonly [number, number, number, number] {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[indexOf(mask, x, y)] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("No foreground subject found");
  return [minX, minY, maxX, maxY];
}

export function normalizeCatView(
  raster: RgbaRaster,
  target: { readonly width: number; readonly height: number },
  rotate180 = false,
): NormalizedCatView {
  const sourceMask = extractForegroundMask(raster);
  const [minX, minY, maxX, maxY] = foregroundBounds(sourceMask);
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const data = new Uint8Array(target.width * target.height);
  const rgba = new Uint8ClampedArray(target.width * target.height * 4);
  rgba.fill(255);
  const scale = Math.min(target.width / cropWidth, target.height / cropHeight);
  const fittedWidth = Math.min(target.width, Math.max(1, Math.round(cropWidth * scale)));
  const fittedHeight = Math.min(target.height, Math.max(1, Math.round(cropHeight * scale)));
  const offsetX = Math.floor((target.width - fittedWidth) / 2);
  const offsetY = target.height - fittedHeight;

  for (let fittedY = 0; fittedY < fittedHeight; fittedY += 1) {
    for (let fittedX = 0; fittedX < fittedWidth; fittedX += 1) {
      const x = offsetX + fittedX;
      const y = offsetY + fittedY;
      const sampleX = Math.min(cropWidth - 1, Math.floor(((fittedX + 0.5) / fittedWidth) * cropWidth));
      const sampleY = Math.min(cropHeight - 1, Math.floor(((fittedY + 0.5) / fittedHeight) * cropHeight));
      const sourceX = rotate180 ? maxX - sampleX : minX + sampleX;
      const sourceY = rotate180 ? maxY - sampleY : minY + sampleY;
      const sourceCell = indexOf(sourceMask, sourceX, sourceY);
      const targetCell = indexOf({ width: target.width }, x, y);
      data[targetCell] = sourceMask.data[sourceCell] ?? 0;
      const sourceOffset = sourceCell * 4;
      const targetOffset = targetCell * 4;
      rgba[targetOffset] = raster.data[sourceOffset] ?? 255;
      rgba[targetOffset + 1] = raster.data[sourceOffset + 1] ?? 255;
      rgba[targetOffset + 2] = raster.data[sourceOffset + 2] ?? 255;
      rgba[targetOffset + 3] = 255;
    }
  }

  return { width: target.width, height: target.height, data, sourceMask: data.slice(), rgba };
}

export async function loadImageRgba(url: string, maxEdge = 192): Promise<RgbaRaster> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Unable to load cat view: ${url}`));
  });

  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("Unable to create image processing canvas");
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return { width, height, data: imageData.data };
}

export type Rgb = readonly [number, number, number];

function toHex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function parseHexColor(value: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (match === null) throw new Error(`Invalid photo palette color: ${value}`);
  return [Number.parseInt(match[1] ?? "00", 16), Number.parseInt(match[2] ?? "00", 16), Number.parseInt(match[3] ?? "00", 16)];
}

function channelRange(pixels: readonly Rgb[], channel: number): number {
  const values = pixels.map((pixel) => pixel[channel] ?? 0);
  return Math.max(...values) - Math.min(...values);
}

function average(pixels: readonly Rgb[]): Rgb {
  const total = pixels.reduce(
    (sum, pixel) => [sum[0] + pixel[0], sum[1] + pixel[1], sum[2] + pixel[2]] as const,
    [0, 0, 0] as Rgb,
  );
  return total.map((value) => Math.round(value / pixels.length)) as unknown as Rgb;
}

export function quantizePhotoPalette(pixels: readonly Rgb[], maxColors = 16): readonly string[] {
  if (maxColors < 1) throw new Error("Photo palette must contain at least one color");
  const seen = new Set<string>();
  const unique: Rgb[] = [];
  for (const pixel of pixels) {
    const color = toHex(pixel);
    if (seen.has(color)) continue;
    seen.add(color);
    unique.push(pixel);
  }
  if (unique.length === 0) return ["#ffffff"];
  if (unique.length <= maxColors) return unique.map(toHex);

  const buckets: Array<{ pixels: Rgb[]; order: number }> = [{ pixels: unique, order: 0 }];
  let nextOrder = 1;
  while (buckets.length < maxColors) {
    const candidates = buckets
      .map((bucket, index) => ({
        index,
        range: Math.max(channelRange(bucket.pixels, 0), channelRange(bucket.pixels, 1), channelRange(bucket.pixels, 2)),
        size: bucket.pixels.length,
        order: bucket.order,
      }))
      .filter((candidate) => candidate.size > 1)
      .sort((a, b) => b.range - a.range || b.size - a.size || a.order - b.order);
    const selected = candidates[0];
    if (selected === undefined) break;
    const bucket = buckets[selected.index];
    if (bucket === undefined) break;
    const ranges = [0, 1, 2].map((channel) => channelRange(bucket.pixels, channel));
    const channel = ranges.indexOf(Math.max(...ranges));
    const sorted = bucket.pixels
      .map((pixel, index) => ({ pixel, index }))
      .sort((a, b) => (a.pixel[channel] ?? 0) - (b.pixel[channel] ?? 0) || a.index - b.index)
      .map(({ pixel }) => pixel);
    const middle = Math.ceil(sorted.length / 2);
    buckets.splice(
      selected.index,
      1,
      { pixels: sorted.slice(0, middle), order: nextOrder },
      { pixels: sorted.slice(middle), order: nextOrder + 1 },
    );
    nextOrder += 2;
  }

  return buckets.sort((a, b) => a.order - b.order).map((bucket) => toHex(average(bucket.pixels)));
}

function colorDistance(left: Rgb, right: Rgb): number {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2;
}

export function nearestPaletteColor(sample: Rgb, palette: readonly string[]): string {
  if (palette.length === 0) throw new Error("Photo palette is empty");
  return [...palette]
    .map((color, index) => ({ color, index, distance: colorDistance(sample, parseHexColor(color)) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)[0]?.color ?? palette[0] ?? "#ffffff";
}


export const CAT_IDS = ["cat-01", "cat-02", "cat-03", "cat-04", "cat-05"] as const;
export type CatId = (typeof CAT_IDS)[number];

export const PALETTE_KEYS = ["base", "secondary", "dark", "light", "eye", "nose"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type PixelPattern = readonly string[];

export const PATTERN_LEGEND: Readonly<Record<string, PaletteKey>> = {
  b: "base",
  s: "secondary",
  d: "dark",
  l: "light",
  e: "eye",
  n: "nose",
};

const PALETTE_SYMBOL: Readonly<Record<PaletteKey, string>> = {
  base: "b",
  secondary: "s",
  dark: "d",
  light: "l",
  eye: "e",
  nose: "n",
};

export interface CatAppearance {
  readonly id: CatId;
  readonly name: string;
  readonly detail: string;
  readonly palette: Readonly<Record<PaletteKey, string>>;
  readonly patterns: Readonly<Record<"face" | "body" | "legs" | "tail", PixelPattern>>;
}

const rows = (...value: string[]): PixelPattern => value;
const solid = (key: PaletteKey): PixelPattern =>
  Array.from({ length: 8 }, () => PALETTE_SYMBOL[key].repeat(8));

export const DEFAULT_CAT_ID: CatId = "cat-01";

export function validateAppearance(value: CatAppearance): void {
  if (!value.name.trim() || !value.detail.trim()) {
    throw new Error("appearance copy is required");
  }

  for (const key of PALETTE_KEYS) {
    if (!/^#[0-9a-f]{6}$/i.test(value.palette[key])) {
      throw new Error(`invalid color: ${key}`);
    }
  }

  const legal = new Set(Object.keys(PATTERN_LEGEND));
  for (const pattern of Object.values(value.patterns)) {
    if (pattern.length !== 8 || pattern.some((row) => row.length !== 8)) {
      throw new Error("patterns must be 8x8");
    }
    if (pattern.some((row) => [...row].some((cell) => !legal.has(cell)))) {
      throw new Error("pattern contains an unknown palette key");
    }
  }
}

const cats: readonly CatAppearance[] = [
  {
    id: "cat-01",
    name: "小满",
    detail: "三花短毛",
    palette: {
      base: "#eee4cf",
      secondary: "#d77a32",
      dark: "#2b2724",
      light: "#fff8e9",
      eye: "#85a94e",
      nose: "#d98983",
    },
    patterns: {
      face: rows("ddssbssd", "dssbbssd", "ssbbbbss", "sbbbbbbs", "bbbbbbbb", "bbllllbb", "bbbnnbbb", "bbbbbbbb"),
      body: rows("dddbbsss", "dddbbsss", "ssdbbbss", "ssbbbsss", "bbbsssdd", "bbbsssdd", "bbssssdd", "bbssssdd"),
      legs: solid("light"),
      tail: rows("dddddddd", "dddddddd", "ssssssss", "ssssssss", "dddddddd", "dddddddd", "ssssssss", "ssssssss"),
    },
  },
  {
    id: "cat-02",
    name: "橘子",
    detail: "橘色长毛",
    palette: {
      base: "#d98635",
      secondary: "#ad5b25",
      dark: "#6f3a22",
      light: "#f4d09d",
      eye: "#c8942d",
      nose: "#d68173",
    },
    patterns: {
      face: rows("bbssbbss", "bbssbbss", "bbbbbbbb", "ssbbbbss", "bbbbbbbb", "bbllllbb", "bbbnnbbb", "bbbbbbbb"),
      body: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss"),
      legs: rows("bbbbbbbb", "bbbbbbbb", "ssssssss", "ssssssss", "bbbbbbbb", "bbbbbbbb", "llllllll", "llllllll"),
      tail: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss"),
    },
  },
  {
    id: "cat-03",
    name: "墨墨",
    detail: "黑白燕尾服",
    palette: {
      base: "#242321",
      secondary: "#4a4742",
      dark: "#121212",
      light: "#f6f0df",
      eye: "#d7ac36",
      nose: "#c77e78",
    },
    patterns: {
      face: rows("bbbbbbbb", "bbbllbbb", "bbbllbbb", "bbbbbbbb", "bbbbbbbb", "bbllllbb", "bbbnnbbb", "bbbllbbb"),
      body: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbllbbb", "bbllllbb", "bllllllb", "bllllllb", "bbbbbbbb"),
      legs: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "llllllll", "llllllll", "llllllll"),
      tail: solid("base"),
    },
  },
  {
    id: "cat-04",
    name: "银豆",
    detail: "银灰英短",
    palette: {
      base: "#a8a6a0",
      secondary: "#77756f",
      dark: "#45443f",
      light: "#dedbd1",
      eye: "#cc7f27",
      nose: "#a96867",
    },
    patterns: {
      face: rows("bbssbbss", "bbssbbss", "ssbbbbss", "bbbbbbbb", "ssbbbbss", "bbllllbb", "bbbnnbbb", "bbbbbbbb"),
      body: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "bbssssbb", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss"),
      legs: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "llllllll", "llllllll"),
      tail: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "dddddddd"),
    },
  },
  {
    id: "cat-05",
    name: "奶盖",
    detail: "奶油布偶",
    palette: {
      base: "#e5d1ac",
      secondary: "#9a7351",
      dark: "#4f392e",
      light: "#f9f1df",
      eye: "#5b9fd1",
      nose: "#9d6865",
    },
    patterns: {
      face: rows("ssddddss", "sdddddds", "sdddddds", "ssddddss", "bbbssbbb", "bbllllbb", "bbbnnbbb", "bbbbbbbb"),
      body: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbllllbb", "bbllllbb"),
      legs: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "llllllll", "llllllll", "llllllll", "llllllll"),
      tail: solid("dark"),
    },
  },
];

for (const cat of cats) validateAppearance(cat);

export const CAT_APPEARANCES = cats;

export function getCatAppearance(id: string): { appearance: CatAppearance; didFallback: boolean } {
  const appearance = cats.find((cat) => cat.id === id);
  return appearance === undefined
    ? { appearance: cats[0], didFallback: true }
    : { appearance, didFallback: false };
}

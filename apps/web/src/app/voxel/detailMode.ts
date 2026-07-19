export const DETAIL_MODES = ["detailed", "performance"] as const;
export type DetailMode = (typeof DETAIL_MODES)[number];
export const DEFAULT_DETAIL_MODE: DetailMode = "detailed";

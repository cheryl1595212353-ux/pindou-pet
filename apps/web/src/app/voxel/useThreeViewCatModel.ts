import { useEffect, useMemo, useRef, useState } from "react";

import type { CatAppearance, CatId } from "./appearances";
import {
  loadNormalizedCatViews,
  type CatViewLoader,
  type LoadedCatViews,
} from "./threeViewAssets";
import type {
  BinaryMask,
  CatViewName,
  NormalizedCatView,
  ShapeCorrections,
} from "./threeViewTypes";
import {
  buildPersonalizedVoxelModel,
  DETAILED_RESOLUTION,
  PERFORMANCE_RESOLUTION,
  type PersonalizedVoxelModel,
} from "./visualHull";

export interface ThreeViewCatModelState {
  readonly status: "loading" | "ready" | "error";
  readonly views: Readonly<Record<CatViewName, NormalizedCatView>> | null;
  readonly detailed: PersonalizedVoxelModel | null;
  readonly performance: PersonalizedVoxelModel | null;
  readonly message: string | null;
}

interface UseThreeViewCatModelArgs {
  readonly catId: CatId;
  readonly appearance: CatAppearance;
  readonly corrections: ShapeCorrections;
  readonly maskOverrides: Partial<Record<CatViewName, BinaryMask>>;
  readonly loader?: CatViewLoader;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "个性轮廓生成失败";
}

function applyOverrides(
  loaded: LoadedCatViews,
  overrides: Partial<Record<CatViewName, BinaryMask>>,
): Readonly<Record<CatViewName, NormalizedCatView>> {
  return Object.fromEntries(([
    "front", "side", "top",
  ] as const).map((name) => {
    const view = loaded.views[name];
    const override = overrides[name];
    if (override === undefined) return [name, view];
    if (override.width !== view.width || override.height !== view.height) {
      throw new Error(`轮廓尺寸不匹配：${name}`);
    }
    return [name, { ...view, data: override.data.slice() }];
  })) as unknown as Readonly<Record<CatViewName, NormalizedCatView>>;
}

export function useThreeViewCatModel({
  catId,
  appearance,
  corrections,
  maskOverrides,
  loader = loadNormalizedCatViews,
}: UseThreeViewCatModelArgs): ThreeViewCatModelState {
  const [loaded, setLoaded] = useState<{
    readonly catId: CatId;
    readonly value: LoadedCatViews | null;
    readonly error: string | null;
  }>({ catId, value: null, error: null });
  const lastValid = useRef<{ readonly catId: CatId; readonly state: ThreeViewCatModelState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded({ catId, value: null, error: null });
    void loader(catId, appearance).then(
      (value) => {
        if (!cancelled) setLoaded({ catId, value, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ catId, value: null, error: messageFrom(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [appearance, catId, loader]);

  return useMemo(() => {
    const previous = lastValid.current?.catId === catId ? lastValid.current.state : null;
    if (loaded.catId !== catId || loaded.value === null) {
      if (loaded.error !== null) {
        return {
          status: "error",
          views: previous?.views ?? null,
          detailed: previous?.detailed ?? null,
          performance: previous?.performance ?? null,
          message: loaded.error,
        };
      }
      return { status: "loading", views: null, detailed: null, performance: null, message: null };
    }

    try {
      const views = applyOverrides(loaded.value, maskOverrides);
      const detailed = buildPersonalizedVoxelModel({
        views,
        appearance,
        corrections,
        resolution: DETAILED_RESOLUTION,
        tailProfile: loaded.value.tailProfile,
      });
      const performance = buildPersonalizedVoxelModel({
        views,
        appearance,
        corrections,
        resolution: PERFORMANCE_RESOLUTION,
        tailProfile: loaded.value.tailProfile,
      });
      const state: ThreeViewCatModelState = {
        status: "ready",
        views,
        detailed,
        performance,
        message: null,
      };
      lastValid.current = { catId, state };
      return state;
    } catch (error) {
      return {
        status: "error",
        views: previous?.views ?? loaded.value.views,
        detailed: previous?.detailed ?? null,
        performance: previous?.performance ?? null,
        message: messageFrom(error),
      };
    }
  }, [appearance, catId, corrections, loaded, maskOverrides]);
}

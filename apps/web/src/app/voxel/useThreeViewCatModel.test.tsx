import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getCatAppearance } from "./appearances";
import type { LoadedCatViews } from "./threeViewAssets";
import type { BinaryMask, CatViewName, NormalizedCatView } from "./threeViewTypes";
import { DEFAULT_SHAPE_CORRECTIONS } from "./threeViewTypes";
import { useThreeViewCatModel } from "./useThreeViewCatModel";

function solidView(width: number, height: number): NormalizedCatView {
  const data = new Uint8Array(width * height).fill(1);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let cell = 0; cell < width * height; cell += 1) {
    rgba[cell * 4] = 135;
    rgba[cell * 4 + 1] = 91;
    rgba[cell * 4 + 2] = 52;
    rgba[cell * 4 + 3] = 255;
  }
  return { width, height, data, sourceMask: data.slice(), rgba };
}

const loaded: LoadedCatViews = {
  views: {
    front: solidView(24, 48),
    side: solidView(56, 48),
    top: solidView(24, 56),
  },
  tailProfile: { lengthRatio: 0.45, thicknessRatio: 0.2, color: "#875b34" },
};

describe("useThreeViewCatModel", () => {
  it("transitions from loading to two personalized resolutions", async () => {
    let resolveLoad: ((value: LoadedCatViews) => void) | undefined;
    const loader = () => new Promise<LoadedCatViews>((resolve) => {
      resolveLoad = resolve;
    });
    const appearance = getCatAppearance("cat-01").appearance;
    const { result } = renderHook(() => useThreeViewCatModel({
      catId: "cat-01",
      appearance,
      corrections: DEFAULT_SHAPE_CORRECTIONS,
      maskOverrides: {},
      loader,
    }));

    expect(result.current.status).toBe("loading");
    await act(async () => resolveLoad?.(loaded));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.detailed).not.toBeNull();
    expect(result.current.performance).not.toBeNull();
    expect(result.current.performance?.main.length).toBeLessThan(result.current.detailed?.main.length ?? 0);
  });

  it("keeps the last valid model when an edit erases a complete view", async () => {
    const appearance = getCatAppearance("cat-01").appearance;
    const loader = async () => loaded;
    const initial: Partial<Record<CatViewName, BinaryMask>> = {};
    const { result, rerender } = renderHook(
      ({ overrides }) => useThreeViewCatModel({
        catId: "cat-01",
        appearance,
        corrections: DEFAULT_SHAPE_CORRECTIONS,
        maskOverrides: overrides,
        loader,
      }),
      { initialProps: { overrides: initial } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const valid = result.current.detailed;

    rerender({
      overrides: {
        front: { width: 24, height: 48, data: new Uint8Array(24 * 48) },
      },
    });

    expect(result.current.status).toBe("error");
    expect(result.current.detailed).toBe(valid);
  });
});

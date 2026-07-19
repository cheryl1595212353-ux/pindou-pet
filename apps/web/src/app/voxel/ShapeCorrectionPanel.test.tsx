import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShapeCorrectionPanel } from "./ShapeCorrectionPanel";
import {
  DEFAULT_SHAPE_CORRECTIONS,
  type BinaryMask,
  type CatViewName,
  type NormalizedCatView,
} from "./threeViewTypes";

function view(width: number, height: number, filled = false): NormalizedCatView {
  const data = new Uint8Array(width * height).fill(filled ? 1 : 0);
  return {
    width,
    height,
    data,
    sourceMask: data.slice(),
    rgba: new Uint8ClampedArray(width * height * 4),
  };
}

const views: Readonly<Record<CatViewName, NormalizedCatView>> = {
  front: view(6, 8),
  side: view(10, 8),
  top: view(6, 10),
};

let canvasContext: Pick<CanvasRenderingContext2D, "clearRect" | "fillRect">;

beforeEach(() => {
  canvasContext = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    ...canvasContext,
    fillStyle: "",
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShapeCorrectionPanel", () => {
  it("opens all three masks and exposes five bounded correction sliders", () => {
    render(
      <ShapeCorrectionPanel
        corrections={DEFAULT_SHAPE_CORRECTIONS}
        maskOverrides={{}}
        onCorrectionsChange={vi.fn()}
        onMaskChange={vi.fn()}
        onReset={vi.fn()}
        views={views}
      />,
    );

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("轮廓校正"));

    expect(screen.getByRole("button", { name: "正面轮廓" })).toBeVisible();
    expect(screen.getByRole("button", { name: "侧面轮廓" })).toBeVisible();
    expect(screen.getByRole("button", { name: "俯视轮廓" })).toBeVisible();
    expect(screen.getByRole("button", { name: "补轮廓" })).toBeVisible();
    expect(screen.getByRole("button", { name: "擦轮廓" })).toBeVisible();
    expect(canvasContext.fillRect).toHaveBeenCalled();

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(5);
    for (const slider of sliders) {
      expect(slider).toHaveAttribute("min", "0.8");
      expect(slider).toHaveAttribute("max", "1.2");
      expect(slider).toHaveAttribute("step", "0.02");
    }

    fireEvent.click(screen.getByRole("button", { name: "侧面轮廓" }));
    expect(screen.getByLabelText("侧面可编辑轮廓")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "俯视轮廓" }));
    expect(screen.getByLabelText("俯视可编辑轮廓")).toBeVisible();
  });

  it("emits a new bounded correction object and resets on request", () => {
    const onCorrectionsChange = vi.fn();
    const onReset = vi.fn();
    render(
      <ShapeCorrectionPanel
        corrections={DEFAULT_SHAPE_CORRECTIONS}
        maskOverrides={{}}
        onCorrectionsChange={onCorrectionsChange}
        onMaskChange={vi.fn()}
        onReset={onReset}
        views={views}
      />,
    );
    fireEvent.click(screen.getByText("轮廓校正"));

    fireEvent.change(screen.getByRole("slider", { name: "头宽" }), {
      target: { value: "1.2" },
    });

    const next = onCorrectionsChange.mock.calls[0]?.[0];
    expect(next).not.toBe(DEFAULT_SHAPE_CORRECTIONS);
    expect(next).toEqual({ ...DEFAULT_SHAPE_CORRECTIONS, headWidth: 1.2 });

    fireEvent.click(screen.getByRole("button", { name: "恢复自动轮廓" }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("paints and erases cloned masks in the selected view", () => {
    const onMaskChange = vi.fn();
    const viewResult = render(
      <ShapeCorrectionPanel
        corrections={DEFAULT_SHAPE_CORRECTIONS}
        maskOverrides={{}}
        onCorrectionsChange={vi.fn()}
        onMaskChange={onMaskChange}
        onReset={vi.fn()}
        views={views}
      />,
    );
    fireEvent.click(screen.getByText("轮廓校正"));
    const canvas = screen.getByLabelText("正面可编辑轮廓");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 120,
      bottom: 160,
      width: 120,
      height: 160,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 80, pointerId: 1 });

    const added = onMaskChange.mock.calls[0]?.[1] as BinaryMask;
    expect(onMaskChange.mock.calls[0]?.[0]).toBe("front");
    expect(added).not.toBe(views.front);
    expect(added.data).not.toBe(views.front.data);
    expect([...added.data].some((value) => value === 1)).toBe(true);

    viewResult.rerender(
      <ShapeCorrectionPanel
        corrections={DEFAULT_SHAPE_CORRECTIONS}
        maskOverrides={{ front: added }}
        onCorrectionsChange={vi.fn()}
        onMaskChange={onMaskChange}
        onReset={vi.fn()}
        views={views}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "擦轮廓" }));
    const updatedCanvas = screen.getByLabelText("正面可编辑轮廓");
    vi.spyOn(updatedCanvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 120,
      bottom: 160,
      width: 120,
      height: 160,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(updatedCanvas, { clientX: 60, clientY: 80, pointerId: 2 });
    fireEvent.pointerUp(updatedCanvas, { clientX: 60, clientY: 80, pointerId: 2 });

    const erased = onMaskChange.mock.calls[1]?.[1] as BinaryMask;
    expect([...erased.data].filter(Boolean).length).toBeLessThan(
      [...added.data].filter(Boolean).length,
    );
  });
});

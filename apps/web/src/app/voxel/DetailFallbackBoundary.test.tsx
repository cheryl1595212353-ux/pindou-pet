import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DetailFallbackBoundary } from "./DetailFallbackBoundary";

function BrokenVisual(): never {
  throw new Error("voxel generation failed");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DetailFallbackBoundary", () => {
  it("shows the coarse fallback and reports the failure", () => {
    const onFallback = vi.fn();

    render(
      <DetailFallbackBoundary
        fallback={<div>粗粒度猫</div>}
        onFallback={onFallback}
        resetKey="cat-01"
      >
        <BrokenVisual />
      </DetailFallbackBoundary>,
    );

    expect(screen.getByText("粗粒度猫")).toBeVisible();
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("retries its children when the reset key changes", () => {
    const onFallback = vi.fn();
    const view = render(
      <DetailFallbackBoundary
        fallback={<div>粗粒度猫</div>}
        onFallback={onFallback}
        resetKey="cat-01"
      >
        <BrokenVisual />
      </DetailFallbackBoundary>,
    );

    view.rerender(
      <DetailFallbackBoundary
        fallback={<div>粗粒度猫</div>}
        onFallback={onFallback}
        resetKey="cat-02"
      >
        <div>精细体素猫</div>
      </DetailFallbackBoundary>,
    );

    expect(screen.getByText("精细体素猫")).toBeVisible();
  });
});

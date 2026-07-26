import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PixelDogStudio } from "./PixelDogStudio";
import { SLEEPING_AFTER_MS, WAITING_AFTER_MS } from "./pixelDogModel";

describe("PixelDogStudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("starts with a living idle pet and exposes its current state", () => {
    render(<PixelDogStudio />);

    expect(screen.getByRole("heading", { name: "和豆包一起玩" })).toBeVisible();
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" })).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("reacts to clicks, petting, feeding, and jumping", () => {
    render(<PixelDogStudio />);
    const dog = screen.getByRole("button", { name: "抚摸或点击豆包" });

    fireEvent.click(dog);
    expect(screen.getByRole("status")).toHaveTextContent("豆包很开心");

    fireEvent.pointerDown(dog, { pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在享受抚摸");
    fireEvent.pointerUp(dog, { pointerId: 1 });

    fireEvent.click(screen.getByRole("button", { name: "喂食" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在吃饭");
    expect(screen.getByLabelText("豆包的食盆")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "跳跃" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包跳起来了");
  });

  it("moves with focused keyboard controls and stops on key release", () => {
    render(<PixelDogStudio />);
    const playroom = screen.getByRole("region", { name: "豆包的互动房间" });

    fireEvent.keyDown(playroom, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在向左走");

    fireEvent.keyUp(playroom, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("waits and then sleeps after the approved inactivity windows", () => {
    render(<PixelDogStudio />);

    act(() => {
      vi.advanceTimersByTime(WAITING_AFTER_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包在等你");

    act(() => {
      vi.advanceTimersByTime(SLEEPING_AFTER_MS - WAITING_AFTER_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包睡着了");

    fireEvent.click(screen.getByRole("button", { name: "叫醒豆包" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });
});

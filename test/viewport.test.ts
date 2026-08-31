import { describe, expect, it } from "vitest";
import { pinchScale, zoomViewportAt } from "../src/viewport";

describe("viewport", () => {
  it("缩放时保持焦点下的画布坐标不变", () => {
    expect(zoomViewportAt({ panX: 10, panY: 20, scale: 1 }, { x: 100, y: 80 }, 2)).toEqual({
      panX: -80,
      panY: -40,
      scale: 2,
    });
  });

  it("将捏合比例限制在 50% 到 250%", () => {
    expect(pinchScale(1, 100, 20)).toBe(0.5);
    expect(pinchScale(1, 100, 150)).toBe(1.5);
    expect(pinchScale(1, 100, 400)).toBe(2.5);
  });
});

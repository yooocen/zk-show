import { describe, expect, it } from "vitest";
import { shouldPreviewLinkOnPointer } from "../src/hover-link";

describe("链接标题预览触发条件", () => {
  it("只接受按住 Ctrl 的鼠标指针", () => {
    expect(shouldPreviewLinkOnPointer({ pointerType: "mouse", ctrlKey: true })).toBe(true);
    expect(shouldPreviewLinkOnPointer({ pointerType: "mouse", ctrlKey: false })).toBe(false);
    expect(shouldPreviewLinkOnPointer({ pointerType: "touch", ctrlKey: true })).toBe(false);
    expect(shouldPreviewLinkOnPointer({ pointerType: "pen", ctrlKey: true })).toBe(false);
  });
});

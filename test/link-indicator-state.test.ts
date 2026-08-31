import { expect, it } from "vitest";
import { linkIndicatorLabel, hasInlineLinks, linkIndicatorState } from "../src/inline-links";

it("仅在有正文双链时显示标记并生成数量提示", () => {
  const links = [{ link: "B", label: "B", path: "b.md", title: "B" }];
  expect(hasInlineLinks(links)).toBe(true);
  expect(linkIndicatorLabel("A", links)).toBe("显示 A 的正文双链（1）");
  expect(hasInlineLinks([])).toBe(false);
});

it("根据弹出层状态切换灯泡熄灭和点亮样式", () => {
  expect(linkIndicatorState(false)).toBe("is-unlit");
  expect(linkIndicatorState(true)).toBe("is-lit");
});

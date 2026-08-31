import { expect, it } from "vitest";
import { scanInlineLinks } from "../src/inline-links";

it("把 metadata cache 出链解析成可渲染数据", () => {
  const result = scanInlineLinks(
    [
      { link: "目标", displayText: "目标" },
      { link: "别名目标", displayText: "显示名称" },
    ],
    "来源.md",
    (link, source) => link === "目标" && source === "来源.md"
      ? { path: "目标.md", title: "目标" }
      : null,
  );

  expect(result).toMatchObject([
    { link: "目标", label: "目标", path: "目标.md", title: "目标" },
    { link: "别名目标", label: "显示名称", path: null, title: "别名目标" },
  ]);
});

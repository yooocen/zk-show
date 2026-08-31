import { describe, expect, it } from "vitest";
import { extractInlineLinks, type InlineLinkCacheEntry } from "../src/inline-links";

describe("extractInlineLinks", () => {
  it("保留普通链接、别名和未解析目标", () => {
    const entries: InlineLinkCacheEntry[] = [
      { link: "目标笔记", displayText: "目标笔记" },
      { link: "已存在", displayText: "友好名称" },
      { link: "待创建", displayText: "待创建" },
    ];
    const result = extractInlineLinks(entries, (link) =>
      link === "已存在" ? { path: "已存在.md", title: "已存在" } : null
    );

    expect(result).toEqual([
      { link: "目标笔记", label: "目标笔记", path: null, title: "目标笔记" },
      { link: "已存在", label: "友好名称", path: "已存在.md", title: "已存在" },
      { link: "待创建", label: "待创建", path: null, title: "待创建" },
    ]);
  });

  it("删除重复链接并忽略空链接", () => {
    expect(extractInlineLinks([
      { link: "A", displayText: "A" },
      { link: "A", displayText: "另一个名字" },
      { link: "", displayText: "" },
    ], () => null)).toHaveLength(1);
  });
});

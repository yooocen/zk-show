import { describe, expect, it } from "vitest";
import { TopicGraph } from "../src/topic-graph";

describe("TopicGraph", () => {
  it("按直接父子边区分数字继续与字母题外分支", () => {
    const graph = new TopicGraph(
      ["1", "1/4", "1/4a", "1/4a1", "1/4b", "1/41", "1/42"].map((code, i) => ({
        path: `k${i}.md`,
        basename: `卡${i}`,
        no: code,
      }))
    );

    expect(graph.node("1/4a")?.edgeKind).toBe("offTopic");
    expect(graph.node("1/4a1")?.edgeKind).toBe("continuation");
    expect(graph.node("1/41")?.edgeKind).toBe("continuation");
    expect(graph.node("1/4a1")?.parentId).toBe("1/4a");
  });

  it("分别稳定排序数字兄弟与字母兄弟", () => {
    const graph = new TopicGraph(
      ["1", "1/4", "1/43", "1/41", "1/42", "1/4c", "1/4a", "1/4b"].map((code, i) => ({
        path: `k${i}.md`,
        basename: `卡${i}`,
        no: code,
      }))
    );

    expect(graph.children("1/4", "continuation").map((n) => n.code)).toEqual(["1/41", "1/42", "1/43"]);
    expect(graph.children("1/4", "offTopic").map((n) => n.code)).toEqual(["1/4a", "1/4b", "1/4c"]);
    expect(graph.children("1/4", "continuation").map((n) => n.siblingOrder)).toEqual([0, 1, 2]);
  });

  it("补齐缺失的中间父节点并标记为幽灵", () => {
    const graph = new TopicGraph([
      { path: "root.md", basename: "根", no: "1" },
      { path: "child.md", basename: "卡41", no: "1/41" },
    ]);

    expect(graph.node("1/4")).toMatchObject({ code: "1/4", path: null, isGhost: true, parentId: "1" });
    expect(graph.node("1/41")).toMatchObject({ parentId: "1/4", isGhost: false });
  });

  it("子级关系只把父节点标记为有子级", () => {
    const graph = new TopicGraph([
      { path: "root.md", basename: "根", no: "1" },
      { path: "child.md", basename: "子", no: "1/1" },
    ]);

    expect(graph.node("1")?.hasChildren).toBe(true);
    expect(graph.node("1/1")?.hasChildren).toBe(false);
  });

  it("后出现的真实卡片替换先前生成的幽灵祖先", () => {
    const graph = new TopicGraph([
      { path: "child.md", basename: "卡41", no: "1/41" },
      { path: "parent.md", basename: "真实父卡", no: "1/4" },
      { path: "root.md", basename: "真实根卡", no: "1" },
    ]);

    expect(graph.node("1")).toMatchObject({ path: "root.md", title: "真实根卡", isGhost: false });
    expect(graph.node("1/4")).toMatchObject({ path: "parent.md", title: "真实父卡", isGhost: false });
  });

  it("同码记录保留首条真实卡片", () => {
    const graph = new TopicGraph([
      { path: "first.md", basename: "第一张", no: "1/1" },
      { path: "second.md", basename: "第二张", no: "1/1" },
    ]);

    expect(graph.node("1/1")).toMatchObject({ path: "first.md", title: "第一张" });
  });
});

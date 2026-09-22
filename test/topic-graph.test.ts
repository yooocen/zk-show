import { describe, expect, it } from "vitest";
import { collectRootTopics, TopicGraph } from "../src/topic-graph";

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

  it("括号多位视为数字继续并数值排序", () => {
    const graph = new TopicGraph(
      ["1", "1/(11)", "1/9", "1/(10)", "1/(10)a"].map((code, i) => ({
        path: `k${i}.md`,
        basename: `卡${i}`,
        no: code,
      }))
    );

    expect(graph.node("1/(10)")?.edgeKind).toBe("continuation");
    expect(graph.node("1/(10)a")?.edgeKind).toBe("offTopic");
    expect(graph.node("1/(10)")?.parentId).toBe("1");
    expect(graph.children("1", "continuation").map((n) => n.code)).toEqual(["1/9", "1/(10)", "1/(11)"]);
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

  it("同一文件多 zkNo 生成共用路径的多个节点", () => {
    const graph = new TopicGraph([
      { path: "a.md", basename: "多主题", no: "1/4a" },
      { path: "a.md", basename: "多主题", no: "2/3b" },
    ]);

    expect(graph.node("1/4a")).toMatchObject({ path: "a.md", isGhost: false, title: "多主题" });
    expect(graph.node("2/3b")).toMatchObject({ path: "a.md", isGhost: false, title: "多主题" });
  });

  it("collectRootTopics 返回全部根话题及标题/幽灵标记", () => {
    const graph = new TopicGraph([
      { path: "root1.md", basename: "数学", no: "1" },
      { path: "child1.md", basename: "子卡", no: "1/41" },
      { path: "root2.md", basename: "编程", no: "2" },
      { path: "deep.md", basename: "深处", no: "3/a/1" },
    ]);
    const items = collectRootTopics(graph);
    expect(items.map((i) => i.code)).toEqual(["1", "2", "3"]);
    expect(items.find((i) => i.code === "1")).toMatchObject({ title: "数学", isGhost: false });
    expect(items.find((i) => i.code === "2")).toMatchObject({ title: "编程", isGhost: false });
    // 根 3 只有真实子级 3/a/1，根节点本身是幽灵
    expect(items.find((i) => i.code === "3")).toMatchObject({ title: "3", isGhost: true });
  });
});

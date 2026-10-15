import { describe, expect, it } from "vitest";
import { projectFocus } from "../src/focus-projection";
import { compileLayoutGraph } from "../src/layout/compiler";
import { TopicGraph } from "../src/topic-graph";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

describe("compileLayoutGraph", () => {
  const graph = new TopicGraph(MATH_TOPIC_RECORDS);

  it("把完整数值链编译为有序的上方水平泳道", () => {
    const projection = projectFocus(graph, "1/12")!;
    const layoutGraph = compileLayoutGraph(projection);
    const branch = layoutGraph.lanes.find((lane) => lane.id === "branch")!;

    expect(branch.nodeIds).toEqual(["1/11", "1/12", "1/13", "1/14", "1/15"]);
    expect(new Set(layoutGraph.nodes.map((node) => node.id)).size).toBe(layoutGraph.nodes.length);
    expect(layoutGraph.constraints).toContainEqual(
      expect.objectContaining({ kind: "above", subjects: branch.nodeIds, anchor: "1/1" })
    );
    expect(layoutGraph.constraints).toContainEqual(
      expect.objectContaining({ kind: "ordered", subjects: branch.nodeIds })
    );
    expect(layoutGraph.edges).toContainEqual(
      expect.objectContaining({ kind: "orthogonal", sourceId: "1/1", targetIds: ["1/11"], style: "solid" })
    );
  });

  it("把全部字母兄弟与当前节点编译到同一条共享虚线主干", () => {
    const projection = projectFocus(graph, "1/11c")!;
    const layoutGraph = compileLayoutGraph(projection);
    const spine = layoutGraph.edges.find((edge) => edge.kind === "spine" && edge.sourceId === "1/11");
    const following = layoutGraph.lanes.find((lane) => lane.id === "following")!;

    expect(spine).toMatchObject({
      style: "dashed",
      targetIds: ["1/11a", "1/11b", "1/11c", "1/11d"],
      direction: "below",
    });
    expect(following.nodeIds).toEqual(["1/11d"]);
    expect(layoutGraph.constraints).toContainEqual(
      expect.objectContaining({
        kind: "rightOf",
        subjects: ["1/11a", "1/11b", "1/11c", "1/11d"],
        anchor: "1/11",
      })
    );
  });

  it("题外话来源行截断在题外话父卡所在同行，更早祖先用折线提示", () => {
    const projection = projectFocus(graph, "1/13a1")!;
    const layoutGraph = compileLayoutGraph(projection);
    const source = layoutGraph.lanes.find((lane) => lane.id === "source")!;

    expect(source.nodeIds).toEqual(["1/11", "1/12", "1/13"]);
    // 根与中间父级不再混入来源行，因此不存在 1→1/1 的同行链
    expect(layoutGraph.edges.some((edge) => edge.kind === "chain" && edge.sourceId === "1")).toBe(false);
    // 更早祖先通过 fold 折线提示，锚定在来源行首张卡
    expect(layoutGraph.edges).toContainEqual(
      expect.objectContaining({ kind: "fold", sourceId: "1/11", placement: "fold-left" })
    );
  });

  it("链内关系、分支关系与提示关系拥有独立语义", () => {
    const projection = projectFocus(graph, "1/11c")!;
    const layoutGraph = compileLayoutGraph(projection);

    expect(layoutGraph.edges).toContainEqual(
      expect.objectContaining({ kind: "chain", sourceId: "1/11c", targetIds: ["1/11c1"], style: "solid" })
    );
    expect(layoutGraph.edges).toContainEqual(
      expect.objectContaining({ kind: "hint", sourceId: "1/11a", style: "solid", placement: "trailing" })
    );
    expect(layoutGraph.edges.some((edge) => edge.kind === "hint" && edge.sourceId === "1/11" && edge.style === "dashed")).toBe(false);
  });
});

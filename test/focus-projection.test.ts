import { describe, expect, it } from "vitest";
import { projectFocus } from "../src/focus-projection";
import { TopicGraph } from "../src/topic-graph";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";
import { OFFTOPIC_SIBLING_RECORDS } from "./fixtures/offtopic-siblings";

const codes = (lane: { cards: Array<{ code: string }> } | null): string[] => lane?.cards.map((card) => card.code) ?? [];

describe("projectFocus", () => {
  const graph = new TopicGraph(MATH_TOPIC_RECORDS);
  const siblingGraph = new TopicGraph(OFFTOPIC_SIBLING_RECORDS);

  it("查看 1/12 时保留完整的数值同级链", () => {
    const projection = projectFocus(graph, "1/12")!;

    expect(codes(projection.baseLane)).toEqual(["1", "1/1"]);
    expect(codes(projection.branchLane)).toEqual(["1/11", "1/12", "1/13", "1/14", "1/15"]);
    expect(projection.branchLane).toMatchObject({ direction: "above", relation: "continuation", anchorId: "1/1" });
    expect(projection.branchLane?.cards.filter((card) => card.isCurrent).map((card) => card.code)).toEqual(["1/12"]);
  });

  it("题外话的数字继续沿题外话主行水平延续", () => {
    const projection = projectFocus(graph, "1/11a2")!;

    expect(codes(projection.baseLane)).toEqual(["1/11"]);
    expect(codes(projection.branchLane)).toEqual(["1/11a", "1/11a1", "1/11a2"]);
    expect(projection.branchLane?.direction).toBe("below");
    expect(projection.branchLane?.relation).toBe("offTopic");
    expect(projection.branchLane?.anchorId).toBe("1/11");
    expect(projection.folded).toBe(true);
    expect(projection.hints).toContainEqual(
      expect.objectContaining({ anchorId: "1/11", kind: "fold", placement: "fold-left" })
    );
  });

  it("题外话的数字继续沿题外话主行延续，并保留题外话起点的来源同行", () => {
    const projection = projectFocus(graph, "1/13a1")!;

    expect(codes(projection.baseLane)).toEqual(["1/11", "1/12", "1/13"]);
    expect(codes(projection.branchLane)).toEqual(["1/13a", "1/13a1"]);
    expect(projection.branchLane).toMatchObject({ direction: "below", relation: "offTopic", anchorId: "1/13" });
    expect(projection.branchLane?.cards.filter((card) => card.isCurrent).map((card) => card.code)).toEqual(["1/13a1"]);
    expect(projection.folded).toBe(true);
    expect(projection.hints).toContainEqual(
      expect.objectContaining({ anchorId: "1/11", kind: "fold", placement: "fold-left" })
    );
    expect(projection.hints).toContainEqual(expect.objectContaining({
      anchorId: "1/13",
      sourceId: "1/13",
      kind: "sourceTail",
      placement: "trailing",
      hiddenIds: ["1/14", "1/15"],
    }));
  });

  it("深层继续的父卡不在根主行时，来源末端提示其后续同级", () => {
    const projection = projectFocus(graph, "1/131")!;

    expect(codes(projection.baseLane)).toEqual(["1/13"]);
    expect(projection.hints).toContainEqual(expect.objectContaining({
      anchorId: "1/13",
      sourceId: "1/13",
      kind: "sourceTail",
      placement: "trailing",
      hiddenIds: ["1/14", "1/15"],
    }));
  });

  it("题外话来源行截断时在来源末端提示隐藏的同级后续", () => {
    const projection = projectFocus(graph, "1/11a")!;

    expect(projection.baseLane.cards.map((card) => card.code)).toEqual(["1/11"]);
    expect(projection.hints).toContainEqual(expect.objectContaining({
      anchorId: "1/11",
      sourceId: "1/11",
      kind: "sourceTail",
      placement: "trailing",
      hiddenIds: ["1/12", "1/13", "1/14", "1/15"],
    }));
  });

  it("查看字母分支时前置兄弟在上方竖列、后续兄弟在下方竖列", () => {
    const projection = projectFocus(graph, "1/11c")!;

    expect(codes(projection.baseLane)).toEqual(["1/11"]);
    expect(codes(projection.previousLane)).toEqual(["1/11a", "1/11b"]);
    expect(codes(projection.branchLane)).toEqual(["1/11c", "1/11c1"]);
    expect(codes(projection.followingLane)).toEqual(["1/11d"]);
    expect(projection.branchLane).toMatchObject({ direction: "below", relation: "offTopic", anchorId: "1/11" });
    expect(projection.followingLane).toMatchObject({
      direction: "below",
      relation: "offTopic",
      anchorId: "1/11",
      orientation: "vertical",
    });
    expect(projection.folded).toBe(true);
    // 锚点下的字母兄弟全部可见后，锚点自己不再产生"后面还有题外分支"的延伸提示
    expect(projection.hints.some((hint) => hint.anchorId === "1/11" && hint.kind === "offTopic")).toBe(false);
    // 前置兄弟自己的后续数字仍然以提示线表达
    expect(projection.hints).toContainEqual(
      expect.objectContaining({
        anchorId: "1/11a",
        sourceId: "1/11a",
        kind: "continuation",
        placement: "trailing",
        hiddenIds: ["1/11a1", "1/11a2"],
      })
    );
  });

  it("后续兄弟自己的后续数字与自己的题外话都保留提示线", () => {
    const projection = projectFocus(siblingGraph, "1/14a")!;

    expect(codes(projection.previousLane)).toEqual([]);
    expect(codes(projection.branchLane)).toEqual(["1/14a", "1/14a1"]);
    expect(codes(projection.followingLane)).toEqual(["1/14b", "1/14c"]);
    // 1/14b 的后续数字 1/14b1：卡右侧实线提示
    expect(projection.hints).toContainEqual(
      expect.objectContaining({
        anchorId: "1/14b",
        sourceId: "1/14b",
        kind: "continuation",
        placement: "trailing",
        hiddenIds: ["1/14b1"],
      })
    );
    // 1/14b 自己的题外话 1/14ba：卡下方虚线提示
    expect(projection.hints).toContainEqual(
      expect.objectContaining({
        anchorId: "1/14b",
        sourceId: "1/14b",
        kind: "offTopic",
        placement: "below",
        hiddenIds: ["1/14ba"],
      })
    );
    // 锚点自己不产生延伸提示
    expect(projection.hints.some((hint) => hint.anchorId === "1/14" && hint.kind === "offTopic")).toBe(false);
  });

  it("题外话主行上的数字继续卡与起点卡看到同一批兄弟", () => {
    const asOrigin = projectFocus(siblingGraph, "1/14a")!;
    const asContinuation = projectFocus(siblingGraph, "1/14a1")!;

    expect(codes(asContinuation.branchLane)).toEqual(["1/14a", "1/14a1"]);
    expect(codes(asContinuation.followingLane)).toEqual(codes(asOrigin.followingLane));
    expect(codes(asContinuation.previousLane)).toEqual(codes(asOrigin.previousLane));
  });

  it("查看 1/11 时展开当前卡直接字母子级，并为其他数值卡保留提示", () => {
    const projection = projectFocus(graph, "1/11")!;
    const below = projection.expansionLanes.find((lane) => lane.direction === "below") ?? null;

    expect(codes(projection.branchLane)).toEqual(["1/11", "1/12", "1/13", "1/14", "1/15"]);
    expect(codes(below)).toEqual(["1/11a", "1/11b", "1/11c", "1/11d"]);
    expect(projection.hints).toContainEqual(
      expect.objectContaining({ anchorId: "1/13", sourceId: "1/13", kind: "continuation", hiddenIds: ["1/131"], placement: "above" })
    );
    expect(projection.hints).toContainEqual(
      expect.objectContaining({ anchorId: "1/13", sourceId: "1/13", kind: "offTopic", hiddenIds: ["1/13a"], placement: "below" })
    );
  });

  it("提示保留语义来源，并记录真实隐藏节点", () => {
    const projection = projectFocus(graph, "1/11")!;
    expect(projection.hints).toContainEqual(expect.objectContaining({
      kind: "continuation",
      sourceId: "1/13",
      hiddenIds: ["1/131"],
    }));
    expect(projection.hints).toContainEqual(expect.objectContaining({
      kind: "offTopic",
      sourceId: "1/13",
      hiddenIds: ["1/13a"],
    }));
  });

  it("折叠提示列出被省略的祖先编码", () => {
    const projection = projectFocus(graph, "1/11c")!;
    expect(projection.hints).toContainEqual(expect.objectContaining({
      kind: "fold",
      sourceId: "1/11",
      hiddenIds: ["1", "1/1"],
    }));
  });

  it("根节点视觉锚点与语义来源可以不同", () => {
    const graphWithRootSiblings = new TopicGraph([
      { path: "数学.md", basename: "数学", no: "1" },
      { path: "线性代数.md", basename: "线性代数", no: "1/1" },
      { path: "绪论.md", basename: "绪论", no: "1/11" },
      { path: "其他.md", basename: "其他", no: "1/2" },
    ]);
    const projection = projectFocus(graphWithRootSiblings, "1/11")!;
    expect(projection.hints).toContainEqual(expect.objectContaining({
      anchorId: "1/1",
      sourceId: "1",
      kind: "continuation",
      hiddenIds: ["1/2"],
    }));
  });

  it("根话题已有主行连接时不在根卡上方生成继续提示，改在最末子级右侧画 trailing", () => {
    const graphWithRootSiblings = new TopicGraph([
      { path: "数学.md", basename: "数学", no: "1" },
      { path: "线性代数.md", basename: "线性代数", no: "1/1" },
      { path: "线性代数绪论.md", basename: "线性代数绪论", no: "1/11" },
      { path: "第1章.md", basename: "第1章", no: "1/12" },
      { path: "其他章节.md", basename: "其他章节", no: "1/2" },
      { path: "题外话.md", basename: "题外话", no: "1/a" },
    ]);
    const projection = projectFocus(graphWithRootSiblings, "1/11")!;

    expect(projection.baseLane.cards.map((card) => card.code)).toEqual(["1", "1/1"]);
    expect(projection.hints).not.toContainEqual(
      expect.objectContaining({ anchorId: "1", kind: "continuation", placement: "above" })
    );
    expect(projection.hints).toContainEqual(
      expect.objectContaining({ anchorId: "1/1", kind: "continuation", placement: "trailing" })
    );
  });

  it("题外话直接挂在根节点时，根卡右侧保留主行延伸提示", () => {
    const graphWithRootOffTopic = new TopicGraph([
      { path: "数学.md", basename: "数学", no: "1" },
      { path: "线性代数.md", basename: "线性代数", no: "1/1" },
      { path: "题外话.md", basename: "题外话", no: "1/a" },
    ]);
    const projection = projectFocus(graphWithRootOffTopic, "1/a")!;

    expect(projection.baseLane.cards.map((card) => card.code)).toEqual(["1"]);
    expect(projection.hints).toContainEqual(
      expect.objectContaining({ anchorId: "1", kind: "continuation", placement: "trailing" })
    );
    expect(projection.hints).not.toContainEqual(
      expect.objectContaining({ anchorId: "1", kind: "continuation", placement: "above" })
    );
  });

  it("索引中没有当前卡时返回 null", () => {
    expect(projectFocus(graph, "9/99")).toBeNull();
  });
});

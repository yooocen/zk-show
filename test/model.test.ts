import { describe, expect, it } from "vitest";
import { ThreadIndex, computeView } from "../src/model";

const CARDS = ["1", "1/1", "1/2", "1/3", "1/4", "1/41", "1/42", "1/4a", "1/4a1", "1/4a2", "1/4b", "1/5"];

function idx(): ThreadIndex {
  return new ThreadIndex(CARDS.map((code, i) => ({ path: `k${i}.md`, basename: `卡${i}`, no: code })));
}

const codes = (lane: { cards: Array<{ code: string }> } | null): string[] => lane?.cards.map((card) => card.code) ?? [];

describe("computeView 兼容入口", () => {
  it("主话题线完整展示，并分别投影当前卡的数字与字母直接子级", () => {
    const view = computeView(idx(), "1/4")!;
    const upper = view.expansionLanes.find((lane) => lane.direction === "above") ?? null;
    const lower = view.expansionLanes.find((lane) => lane.direction === "below") ?? null;

    expect(codes(view.baseLane)).toEqual(["1", "1/1", "1/2", "1/3", "1/4", "1/5"]);
    expect(view.branchLane).toBeNull();
    expect(codes(upper)).toEqual(["1/41", "1/42"]);
    expect(codes(lower)).toEqual(["1/4a", "1/4b"]);
    expect(view.baseLane.cards.filter((card) => card.isCurrent).map((card) => card.code)).toEqual(["1/4"]);
  });

  it("字母分支保留截断来源行、数值后代与来源提示，并显示后续兄弟", () => {
    const view = computeView(idx(), "1/4a")!;

    // 根话题作为来源行首张直接显示并保持平直连接，不再用 fold 折线隐藏
    expect(codes(view.baseLane)).toEqual(["1", "1/1", "1/2", "1/3", "1/4"]);
    expect(codes(view.branchLane)).toEqual(["1/4a", "1/4a1", "1/4a2"]);
    expect(view.branchLane).toMatchObject({ relation: "offTopic", direction: "below", anchorId: "1/4" });
    expect(view.folded).toBe(false);
    expect(view.hints).toContainEqual(expect.objectContaining({ anchorId: "1/4", kind: "continuation", placement: "above" }));
    expect(codes(view.followingLane)).toEqual(["1/4b"]);
    expect(view.hints).toContainEqual(expect.objectContaining({ anchorId: "1/4", kind: "continuation", placement: "trailing" }));
  });

  it("题外话的首层数字继续保留在题外话主行", () => {
    const view = computeView(idx(), "1/4a2")!;

    expect(view.folded).toBe(false);
    expect(codes(view.baseLane)).toEqual(["1", "1/1", "1/2", "1/3", "1/4"]);
    expect(codes(view.branchLane)).toEqual(["1/4a", "1/4a1", "1/4a2"]);
    expect(view.branchLane).toMatchObject({ relation: "offTopic", direction: "below", anchorId: "1/4" });
  });

  it("缺失的直接父级作为幽灵来源卡展示", () => {
    const graph = new ThreadIndex([
      { path: "root.md", basename: "根", no: "1" },
      { path: "child.md", basename: "卡41", no: "1/41" },
    ]);
    const view = computeView(graph, "1/41")!;

    expect(codes(view.baseLane)).toEqual(["1", "1/4"]);
    expect(view.baseLane.cards.find((card) => card.code === "1/4")).toMatchObject({ isGhost: true, path: null });
    expect(codes(view.branchLane)).toEqual(["1/41"]);
  });

  it("括号多位编码投影到主行链", () => {
    const graph = new ThreadIndex([
      { path: "root.md", basename: "根", no: "1" },
      { path: "a.md", basename: "卡9", no: "1/9" },
      { path: "b.md", basename: "卡10", no: "1/(10)" },
      { path: "c.md", basename: "卡11", no: "1/(11)" },
    ]);
    const view = computeView(graph, "1/(10)")!;
    expect(codes(view.baseLane)).toEqual(["1", "1/9", "1/(10)", "1/(11)"]);
    expect(view.baseLane.cards.filter((card) => card.isCurrent).map((card) => card.code)).toEqual(["1/(10)"]);
  });

  it("索引中没有当前卡时返回 null", () => {
    expect(computeView(idx(), "9/99")).toBeNull();
  });
});

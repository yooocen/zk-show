import { describe, expect, it } from "vitest";
import { projectFocus } from "../src/focus-projection";
import { compileLayoutGraph } from "../src/layout/compiler";
import { LAYOUT_METRICS } from "../src/layout/geometry";
import { routeEdges } from "../src/layout/router";
import { solveLayout } from "../src/layout/solver";
import { TopicGraph } from "../src/topic-graph";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

const graph = new TopicGraph(MATH_TOPIC_RECORDS);

function route(code: string) {
  const projection = projectFocus(graph, code)!;
  return routeEdges(solveLayout(compileLayoutGraph(projection)));
}

describe("routeEdges", () => {
  it("数值分支使用实线正交连接父级与完整同级链", () => {
    const routed = route("1/12");
    const parent = routed.nodes.find((node) => node.id === "1/1")!;
    const first = routed.nodes.find((node) => node.id === "1/11")!;
    const vertical = routed.edges.find(
      (edge) => edge.kind === "vbar" && edge.sourceId === "1/1" && edge.targetId === "1/11"
    );
    const horizontal = routed.edges.find(
      (edge) => edge.kind === "link" && edge.sourceId === "1/1" && edge.targetId === "1/11"
    );

    expect(vertical).toMatchObject({ dashed: false, x1: parent.x + parent.width / 2, x2: parent.x + parent.width / 2 });
    expect(horizontal).toMatchObject({ dashed: false, x2: first.x });
  });

  it("字母分支只生成一条共享虚线主干，并为每张来源卡生成横向接线", () => {
    const routed = route("1/11c");
    const parent = routed.nodes.find((node) => node.id === "1/11")!;
    const current = routed.nodes.find((node) => node.id === "1/11c")!;
    const spine = routed.edges.filter(
      (edge) => edge.kind === "vbar" && edge.dashed && edge.sourceId === "1/11" && edge.groupId?.startsWith("branch-spine")
    );
    const links = routed.edges.filter(
      (edge) => edge.kind === "link" && edge.dashed && edge.sourceId === "1/11" && edge.groupId === spine[0]?.groupId
    );

    expect(spine).toHaveLength(1);
    expect(spine[0].x1).toBe(parent.x + parent.width / 2);
    expect(links.map((edge) => edge.targetId)).toEqual(["1/11a", "1/11b", "1/11c"]);
    expect(spine[0].y2).toBeGreaterThan(current.y + current.height / 2);
    expect(spine[0].y2 - (current.y + current.height / 2)).toBe(LAYOUT_METRICS.verticalHintLength);
  });

  it("相邻行相向的隐藏提示竖线占用区域不重叠", () => {
    const routed = route("1/13");
    const upperDown = routed.edges.find(
      (edge) => edge.kind === "vbar" && edge.sourceId === "1/131" && edge.groupId?.startsWith("offTopic:")
    )!;
    const mainUp = routed.edges.find(
      (edge) => edge.kind === "vbar" && edge.sourceId === "1/14" && edge.groupId?.startsWith("continuation:")
    )!;

    const upperRowBottom = Math.max(upperDown.y1, upperDown.y2);
    const mainRowTop = Math.min(mainUp.y1, mainUp.y2);

    expect(mainRowTop - upperRowBottom).toBeGreaterThanOrEqual(4 * 2);
  });

  it("相同方向的提示线段不会重复", () => {
    const routed = route("1/11c");
    const keys = routed.edges.map((edge) => {
      const points = edge.points?.map((point) => `${point.x},${point.y}`).join(";") ?? "";
      return `${edge.kind}:${edge.dashed === true}:${edge.x1},${edge.y1},${edge.x2},${edge.y2}:${points}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("题外话来源行截断在同行并用折线提示更早祖先", () => {
    const routed = route("1/11a2");
    const first = routed.nodes.find((node) => node.id === "1/11")!;

    // 根与中间父级不在来源行，因此不存在 1→1/1 的同行连接
    expect(routed.nodes.some((node) => node.id === "1" || node.id === "1/1")).toBe(false);
    expect(routed.edges.some((edge) => edge.kind === "link" && edge.sourceId === "1")).toBe(false);
    // 更早祖先由锚定在来源行首张卡的 fold 折线表达
    const fold = routed.edges.find((edge) => edge.kind === "poly" && edge.sourceId === "1/11");
    expect(fold).toBeDefined();
    expect(fold?.points?.[0].x).toBeLessThan(first.x);
    expect(fold?.points?.some((point) => point.y > first.y + first.height / 2)).toBe(true);
    const foldVertical = fold?.points?.[0];
    expect(foldVertical?.y).toBe(first.y + first.height / 2 + LAYOUT_METRICS.verticalHintLength);
  });
});

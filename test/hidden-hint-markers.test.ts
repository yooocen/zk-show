import { describe, expect, it } from "vitest";
import { collectHiddenHintMarkers } from "../src/hidden-hint-markers";
import { LAYOUT_METRICS } from "../src/layout/geometry";
import { ThreadIndex, computeView } from "../src/model";
import { layoutView } from "../src/renderer";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

const index = new ThreadIndex(MATH_TOPIC_RECORDS);

describe("collectHiddenHintMarkers", () => {
  it("使用真实投影和路由结果生成继续与题外隐藏端点", () => {
    const view = computeView(index, "1/11")!;
    const layout = layoutView(view);

    const markers = collectHiddenHintMarkers(view, layout);

    expect(markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "continuation", sourceId: "1/13", hiddenIds: ["1/131"], label: "连续内容" }),
      expect.objectContaining({ kind: "offTopic", sourceId: "1/13", hiddenIds: ["1/13a"], label: "题外分支" }),
    ]));
  });

  it("折叠提示圆点落在折线路径的自由端而不是卡片端", () => {
    const view = computeView(index, "1/11c")!;
    const layout = layoutView(view);
    const foldEdge = layout.edges.find((edge) => edge.groupId?.startsWith("fold:"))!;
    const freePoint = foldEdge.points?.[0] ?? { x: foldEdge.x1, y: foldEdge.y1 };

    const marker = collectHiddenHintMarkers(view, layout).find((current) => current.kind === "fold")!;

    expect(marker).toMatchObject({ kind: "fold", sourceId: "1/11", x: freePoint.x, y: freePoint.y });
  });

  it("题外后续被合并进共享主干时使用主干延伸端点", () => {
    const view = computeView(index, "1/11c")!;
    const layout = layoutView(view);
    const spine = layout.edges.find(
      (edge) => edge.groupId?.startsWith("branch-spine:1/11:") && edge.targetId === undefined
    )!;
    const freePoint = spine.points?.[spine.points.length - 1] ?? { x: spine.x2, y: spine.y2 };

    const marker = collectHiddenHintMarkers(view, layout).find(
      (current) => current.kind === "offTopic" && current.sourceId === "1/11"
    )!;

    expect(marker).toMatchObject({ x: freePoint.x, y: freePoint.y, mergedIntoSpine: true });
  });

  it("1/11 来源行右侧显示隐藏的数值后续", () => {
    const view = computeView(index, "1/11a2")!;
    const layout = layoutView(view);
    const source = layout.cards.find((card) => card.code === "1/11")!;
    const marker = collectHiddenHintMarkers(view, layout).find(
      (current) => current.kind === "sourceTail" && current.sourceId === "1/11"
    );
    const edge = layout.edges.find(
      (current) => current.kind === "cont" && current.sourceId === "1/11" && current.x1 === source.x + source.w
    );

    expect(marker).toMatchObject({ hiddenIds: ["1/12", "1/13", "1/14", "1/15"] });
    expect(edge).toMatchObject({ x2: source.x + source.w + LAYOUT_METRICS.hintLength });
  });
});

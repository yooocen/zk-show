import { describe, expect, it } from "vitest";
import { projectFocus } from "../src/focus-projection";
import { compileLayoutGraph } from "../src/layout/compiler";
import { LAYOUT_METRICS } from "../src/layout/geometry";
import { routeEdges } from "../src/layout/router";
import { solveLayout } from "../src/layout/solver";
import { TopicGraph } from "../src/topic-graph";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";
import { OFFTOPIC_SIBLING_RECORDS } from "./fixtures/offtopic-siblings";

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

  it("字母分支只生成一条共享虚线主干，并为每张兄弟卡生成横向接线", () => {
    const routed = route("1/11c");
    const parent = routed.nodes.find((node) => node.id === "1/11")!;
    const last = routed.nodes.find((node) => node.id === "1/11d")!;
    const spine = routed.edges.filter(
      (edge) => edge.kind === "vbar" && edge.dashed && edge.sourceId === "1/11" && edge.groupId?.startsWith("branch-spine")
    );
    const links = routed.edges.filter(
      (edge) => edge.kind === "link" && edge.dashed && edge.sourceId === "1/11" && edge.groupId === spine[0]?.groupId
    );

    expect(spine).toHaveLength(1);
    expect(spine[0].x1).toBe(parent.x + parent.width / 2);
    expect(links.map((edge) => edge.targetId)).toEqual(["1/11a", "1/11b", "1/11c", "1/11d"]);
    // 主干终点是最后一张兄弟卡的中心，不再为"隐藏的后续兄弟"多伸一截
    expect(spine[0].y2).toBe(last.y + last.height / 2);
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

  it("兄弟卡自己的题外话提示垂直挂在它下方，不绕行", () => {
    const family = new TopicGraph(OFFTOPIC_SIBLING_RECORDS);
    const routed = routeEdges(solveLayout(compileLayoutGraph(projectFocus(family, "1/14a")!)));
    const b = routed.nodes.find((node) => node.id === "1/14b")!;
    const stub = routed.edges.find((edge) => edge.groupId?.startsWith("offTopic:1/14b:"))!;

    expect(stub).toBeDefined();
    expect(stub.kind).toBe("vbar");
    expect(stub.dashed).toBe(true);
    expect(stub.x1).toBe(b.x + b.width / 2);
    expect(stub.x2).toBe(b.x + b.width / 2);
    expect(stub.y1).toBe(b.y + b.height);
    expect(stub.y2).toBe(b.y + b.height + LAYOUT_METRICS.verticalHintLength);
  });

  it("焦点行里的数字继续卡也把自己的题外话提示垂直挂在下方", () => {
    const family = new TopicGraph(OFFTOPIC_SIBLING_RECORDS);
    const routed = routeEdges(solveLayout(compileLayoutGraph(projectFocus(family, "1/14a1")!)));
    const origin = routed.nodes.find((node) => node.id === "1/14a")!;
    const stub = routed.edges.find((edge) => edge.groupId?.startsWith("offTopic:1/14a:"))!;

    expect(stub).toBeDefined();
    expect(stub.kind).toBe("vbar");
    expect(stub.x1).toBe(origin.x + origin.width / 2);
    expect(stub.x2).toBe(origin.x + origin.width / 2);
    expect(stub.y1).toBe(origin.y + origin.height);
    expect(stub.y2).toBe(origin.y + origin.height + LAYOUT_METRICS.verticalHintLength);
  });

  it("所有向下提示都从卡片底部垂直下垂，不绕行", () => {
    const sources = [
      { label: "", records: MATH_TOPIC_RECORDS, family: graph },
      { label: "兄弟场景 ", records: OFFTOPIC_SIBLING_RECORDS, family: new TopicGraph(OFFTOPIC_SIBLING_RECORDS) },
    ];
    let checked = 0;

    for (const { label, records, family } of sources) {
      for (const record of records) {
        const code = String(record.no);
        const compiled = compileLayoutGraph(projectFocus(family, code)!);
        const routed = routeEdges(solveLayout(compiled));
        for (const spec of compiled.edges) {
          if (spec.kind !== "hint" || spec.placement !== "below") continue;
          const card = routed.nodes.find((node) => node.id === spec.sourceId);
          const stub = routed.edges.find((edge) => edge.groupId === spec.id);
          const where = `${label}${code}：${spec.sourceId}`;

          expect(card, `${where} 的卡片未放置`).toBeDefined();
          expect(stub, `${where} 缺少提示线段`).toBeDefined();
          expect(stub!.kind, `${where} 的提示线绕行了`).toBe("vbar");
          expect(stub!.x1, `${where} 的提示线未对准卡片中心`).toBe(card!.x + card!.width / 2);
          expect(stub!.x2, `${where} 的提示线未对准卡片中心`).toBe(card!.x + card!.width / 2);
          expect(stub!.y1, `${where} 的提示线未从卡片底部出发`).toBe(card!.y + card!.height);
          expect(stub!.y2, `${where} 的提示线长度不足`).toBe(
            card!.y + card!.height + LAYOUT_METRICS.verticalHintLength
          );
          checked += 1;
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});

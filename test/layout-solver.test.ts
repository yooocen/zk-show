import { describe, expect, it } from "vitest";
import { projectFocus } from "../src/focus-projection";
import { compileLayoutGraph } from "../src/layout/compiler";
import { LAYOUT_METRICS } from "../src/layout/geometry";
import { solveLayout } from "../src/layout/solver";
import type { PositionedNode } from "../src/layout/types";
import { TopicGraph } from "../src/topic-graph";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

const graph = new TopicGraph(MATH_TOPIC_RECORDS);

function solve(code: string) {
  return solveLayout(compileLayoutGraph(projectFocus(graph, code)!));
}

function node(solved: ReturnType<typeof solve>, id: string): PositionedNode {
  const result = solved.nodes.find((item) => item.id === id);
  if (!result) throw new Error(`missing node ${id}`);
  return result;
}

function verticalGap(first: PositionedNode, second: PositionedNode): number {
  return Math.max(first.y, second.y) - Math.min(first.y + first.height, second.y + second.height);
}

function overlaps(a: PositionedNode, b: PositionedNode): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("solveLayout", () => {
  it("exposes the confirmed adaptive spacing floors", () => {
    expect(LAYOUT_METRICS.horizontalGap).toBeGreaterThanOrEqual(40);
    expect(LAYOUT_METRICS.verticalGap).toBeGreaterThanOrEqual(24);
    expect(LAYOUT_METRICS.rowGap).toBeGreaterThanOrEqual(74);
  });

  it("完整数值链水平有序并位于父级上方", () => {
    const solved = solve("1/12");
    const branch = ["1/11", "1/12", "1/13", "1/14", "1/15"].map((id) => solved.nodes.find((node) => node.id === id)!);
    const parent = solved.nodes.find((node) => node.id === "1/1")!;

    expect(new Set(branch.map((node) => node.y)).size).toBe(1);
    expect(branch.every((node) => node.y + node.height < parent.y)).toBe(true);
    for (let i = 1; i < branch.length; i++) {
      expect(branch[i].x - (branch[i - 1].x + branch[i - 1].width)).toBeGreaterThanOrEqual(LAYOUT_METRICS.horizontalGap);
    }
  });

  it("字母历史节点与当前节点右偏、纵向有序且互不重叠", () => {
    const solved = solve("1/11c");
    const parent = solved.nodes.find((node) => node.id === "1/11")!;
    const stack = ["1/11a", "1/11b", "1/11c"].map((id) => solved.nodes.find((node) => node.id === id)!);

    expect(new Set(stack.map((node) => node.x)).size).toBe(1);
    expect(stack.every((node) => node.x > parent.x + parent.width / 2)).toBe(true);
    for (let i = 1; i < stack.length; i++) {
      expect(stack[i].y - (stack[i - 1].y + stack[i - 1].height)).toBeGreaterThanOrEqual(LAYOUT_METRICS.verticalGap);
    }
  });

  it("下方字母分支与主数字行保留统一行间距", () => {
    for (const [focus, parentId, firstChildId] of [
      ["1/13", "1/13", "1/13a"],
      ["1/11c", "1/11", "1/11a"],
    ]) {
      const solved = solve(focus);
      const parent = solved.nodes.find((node) => node.id === parentId)!;
      const child = solved.nodes.find((node) => node.id === firstChildId)!;

      expect(child.y - (parent.y + parent.height), `${focus}: ${parentId} -> ${firstChildId}`).toBeGreaterThanOrEqual(
        LAYOUT_METRICS.rowGap
      );
    }
  });

  it("按语义区域把来源行放在继续讨论行上方", () => {
    const solved = solve("1/131a1");
    const source = node(solved, "1/131");
    const continuation = [node(solved, "1/131a11"), node(solved, "1/131a12")];
    const current = [node(solved, "1/131a"), node(solved, "1/131a1")];

    for (const item of continuation) {
      expect(item.y, `${source.id} -> ${item.id}`).toBeGreaterThanOrEqual(
        source.y + source.height + LAYOUT_METRICS.rowGap
      );
    }
    for (const item of current) {
      expect(item.y, `${item.id} below continuation`).toBeGreaterThanOrEqual(
        Math.max(...continuation.map((entry) => entry.y + entry.height)) + LAYOUT_METRICS.rowGap
      );
    }
  });

  it("来源行位于展开行下方且保留统一行间距", () => {
    const solved = solve("1/11");
    const branch = node(solved, "1/11");
    const expansion = node(solved, "1/11a");
    const source = node(solved, "1/1");

    expect(expansion.y).toBeGreaterThanOrEqual(branch.y + branch.height + LAYOUT_METRICS.rowGap);
    expect(source.y).toBeGreaterThanOrEqual(expansion.y + expansion.height + LAYOUT_METRICS.rowGap);
  });

  it("历史节点与当前节点保持同一泳道并使用紧凑内部间距", () => {
    const solved = solve("1/11c");
    const previous = node(solved, "1/11b");
    const current = node(solved, "1/11c");
    const gap = current.y - (previous.y + previous.height);

    expect(current.x).toBe(previous.x);
    expect(gap).toBeGreaterThanOrEqual(LAYOUT_METRICS.verticalGap);
    expect(gap).toBeLessThan(LAYOUT_METRICS.rowGap);
  });

  it("数学话题关键视图中的卡片矩形全部互不相交", () => {
    for (const code of ["1/11", "1/12", "1/11c", "1/13", "1/13a", "1/131a12"]) {
      const solved = solve(code);
      for (let i = 0; i < solved.nodes.length; i++) {
        for (let j = i + 1; j < solved.nodes.length; j++) {
          expect(overlaps(solved.nodes[i], solved.nodes[j]), `${code}: ${solved.nodes[i].id} overlaps ${solved.nodes[j].id}`).toBe(false);
        }
      }
    }
  });

  it("不同泳道的重叠水平范围保留完整行间净距", () => {
    for (const code of ["1/11", "1/12", "1/11c", "1/13", "1/13a1", "1/131a12"]) {
      const solved = solve(code);
      for (let i = 0; i < solved.nodes.length; i++) {
        for (let j = i + 1; j < solved.nodes.length; j++) {
          const first = solved.nodes[i];
          const second = solved.nodes[j];
          if (first.laneId === second.laneId) continue;
          if (new Set(["previous", "branch"]).has(first.laneId) && new Set(["previous", "branch"]).has(second.laneId)) continue;
          const xOverlaps = first.x < second.x + second.width && first.x + first.width > second.x;
          if (!xOverlaps) continue;
          const gap = Math.max(first.y, second.y) - Math.min(first.y + first.height, second.y + second.height);
          expect(gap, `${code}: ${first.id} / ${second.id}`).toBeGreaterThanOrEqual(LAYOUT_METRICS.rowGap);
        }
      }
    }
  });

  it("相同输入得到完全相同的确定性坐标", () => {
    const first = solve("1/11").nodes.map(({ id, x, y }) => ({ id, x, y }));
    const second = solve("1/11").nodes.map(({ id, x, y }) => ({ id, x, y }));
    expect(second).toEqual(first);
  });
});

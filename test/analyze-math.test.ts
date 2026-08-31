import { describe, expect, it } from "vitest";
import { ThreadIndex, computeView } from "../src/model";
import { layoutView, type PlacedCard } from "../src/renderer";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

const index = new ThreadIndex(MATH_TOPIC_RECORDS);

function layout(code: string) {
  return layoutView(computeView(index, code)!);
}

function overlaps(a: PlacedCard, b: PlacedCard): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function geometryKey(edge: ReturnType<typeof layout>["edges"][number]): string {
  const points = edge.points?.map((point) => `${point.x},${point.y}`).join(";") ?? "";
  return `${edge.kind}:${edge.dashed === true}:${edge.x1},${edge.y1},${edge.x2},${edge.y2}:${points}`;
}

function edgeSegments(edge: ReturnType<typeof layout>["edges"][number]): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const points = edge.points ?? [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
  return points.slice(1).map((point, index) => [points[index], point]);
}

function hitsCardInterior(
  segment: [{ x: number; y: number }, { x: number; y: number }],
  card: PlacedCard
): boolean {
  const [a, b] = segment;
  if (a.x === b.x) {
    return a.x > card.x && a.x < card.x + card.w && Math.max(Math.min(a.y, b.y), card.y) < Math.min(Math.max(a.y, b.y), card.y + card.h);
  }
  if (a.y === b.y) {
    return a.y > card.y && a.y < card.y + card.h && Math.max(Math.min(a.x, b.x), card.x) < Math.min(Math.max(a.x, b.x), card.x + card.w);
  }
  return false;
}

describe("数学话题真实数据回归", () => {
  it("1/11 与 1/12 都保留完整数值同级链，仅当前卡不同", () => {
    for (const code of ["1/11", "1/12"]) {
      const view = computeView(index, code)!;
      expect(view.branchLane?.cards.map((card) => card.code)).toEqual(["1/11", "1/12", "1/13", "1/14", "1/15"]);
      expect(view.branchLane?.cards.filter((card) => card.isCurrent).map((card) => card.code)).toEqual([code]);
    }
  });

  it("题外话的首层数字继续位于题外话来源行下方", () => {
    for (const code of ["1/11a1", "1/11a2", "1/13a1", "1/131a1"]) {
      const result = layout(code);
      const current = result.cards.find((card) => card.code === code)!;
      const parentCode = computeView(index, code)!.branchLane!.anchorId!;
      const parent = result.cards.find((card) => card.code === parentCode)!;
      expect(current.y, code).toBeGreaterThan(parent.y + parent.h);
    }
  });

  it("题外话首层之后的数字继续仍位于直接父级上方", () => {
    for (const code of ["1/131a11", "1/131a12"]) {
      const result = layout(code);
      const current = result.cards.find((card) => card.code === code)!;
      const parentCode = computeView(index, code)!.branchLane!.anchorId!;
      const parent = result.cards.find((card) => card.code === parentCode)!;
      expect(current.y + current.h, code).toBeLessThan(parent.y);
    }
  });

  it("1/131a1 来源行高于继续讨论行，继续讨论行又高于当前行", () => {
    const result = layout("1/131a1");
    const source = result.cards.find((card) => card.code === "1/131")!;
    const continuation = result.cards.filter((card) => ["1/131a11", "1/131a12"].includes(card.code));
    const current = result.cards.filter((card) => ["1/131a", "1/131a1"].includes(card.code));

    expect(Math.min(...continuation.map((card) => card.y))).toBeGreaterThanOrEqual(source.y + source.h + 74);
    expect(Math.min(...current.map((card) => card.y))).toBeGreaterThanOrEqual(
      Math.max(...continuation.map((card) => card.y + card.h)) + 74
    );
  });

  for (const record of MATH_TOPIC_RECORDS) {
    const code = String(record.no);
    it(`${code}：无重叠、无裁切、当前卡唯一、线段无重复`, () => {
      const result = layout(code);
      expect(result.cards.filter((card) => card.isCurrent).map((card) => card.code)).toEqual([code]);

      for (let i = 0; i < result.cards.length; i++) {
        const card = result.cards[i];
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.y).toBeGreaterThanOrEqual(0);
        expect(card.x + card.w).toBeLessThanOrEqual(result.width);
        expect(card.y + card.h).toBeLessThanOrEqual(result.height);
        for (let j = i + 1; j < result.cards.length; j++) {
          expect(overlaps(card, result.cards[j]), `${card.code} overlaps ${result.cards[j].code}`).toBe(false);
        }
      }

      for (const edge of result.edges) {
        const points = edge.points ?? [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
        for (const point of points) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(result.width);
          expect(point.y).toBeLessThanOrEqual(result.height);
        }
      }

      const keys = result.edges.map(geometryKey);
      expect(new Set(keys).size).toBe(keys.length);

      for (const edge of result.edges) {
        for (const card of result.cards) {
          if (card.code === edge.sourceId || card.code === edge.targetId) continue;
          expect(
            edgeSegments(edge).some((segment) => hitsCardInterior(segment, card)),
            `${code}: ${edge.kind} ${edge.x1},${edge.y1}→${edge.x2},${edge.y2} crosses ${card.code}`
          ).toBe(false);
        }
      }
    });
  }
});

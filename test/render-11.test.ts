import { describe, expect, it } from "vitest";
import { ThreadIndex, computeView } from "../src/model";
import { layoutView } from "../src/renderer";
import { LAYOUT_METRICS } from "../src/layout/geometry";
import { MATH_TOPIC_RECORDS } from "./fixtures/math-topic";

const index = new ThreadIndex(MATH_TOPIC_RECORDS);

describe("数学话题 1/11 最终布局", () => {
  it("焦点行、字母子级和来源行符合预期几何关系", () => {
    const result = layoutView(computeView(index, "1/11")!);
    const row = ["1/11", "1/12", "1/13", "1/14", "1/15"].map((code) => result.cards.find((card) => card.code === code)!);
    const letters = ["1/11a", "1/11b", "1/11c", "1/11d"].map((code) => result.cards.find((card) => card.code === code)!);
    const source = result.cards.find((card) => card.code === "1/1")!;

    expect(new Set(row.map((card) => card.y)).size).toBe(1);
    expect(row.map((card) => card.code)).toEqual(["1/11", "1/12", "1/13", "1/14", "1/15"]);
    expect(row[0].isCurrent).toBe(true);
    expect(source.y).toBeGreaterThan(row[0].y);
    expect(new Set(letters.map((card) => card.x)).size).toBe(1);
    for (let i = 1; i < letters.length; i++) {
      expect(letters[i].y).toBeGreaterThan(letters[i - 1].y + letters[i - 1].h);
    }

    const spine = result.edges.filter(
      (edge) => edge.kind === "vbar" && edge.dashed && edge.sourceId === "1/11" && edge.groupId?.startsWith("expansion-spine")
    );
    expect(spine).toHaveLength(1);
    expect(
      result.edges
        .filter((edge) => edge.kind === "link" && edge.dashed && edge.groupId === spine[0].groupId)
        .map((edge) => edge.targetId)
    ).toEqual(["1/11a", "1/11b", "1/11c", "1/11d"]);
  });

  it("来源行位于完整字母展开列下方，不与其他行共享垂直空间", () => {
    const result = layoutView(computeView(index, "1/11")!);
    const source = result.cards.filter((card) => card.code === "1" || card.code === "1/1");
    const lastLetter = result.cards.find((card) => card.code === "1/11d")!;

    expect(source.length).toBe(2);
    expect(Math.min(...source.map((card) => card.y))).toBeGreaterThanOrEqual(
      lastLetter.y + lastLetter.h + LAYOUT_METRICS.rowGap
    );
  });
});

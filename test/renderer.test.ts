import { describe, expect, it } from "vitest";
import { ThreadIndex, computeView } from "../src/model";
import { cardSections, layoutView, type PlacedCard } from "../src/renderer";
import { measureCard } from "../src/layout/geometry";

const CARDS = ["1", "1/1", "1/2", "1/3", "1/4", "1/41", "1/42", "1/4a", "1/4a1", "1/4a2", "1/4b", "1/5"];
const index = new ThreadIndex(CARDS.map((code, i) => ({ path: `k${i}.md`, basename: `卡${i}`, no: code })));

function layout(code: string) {
  return layoutView(computeView(index, code)!);
}

function overlaps(a: PlacedCard, b: PlacedCard): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("layoutView 通用布局管线", () => {
  it("卡片内容按顶部元信息栏和下方标题区组织", () => {
    expect(cardSections({ code: "1/4", title: "标题", links: [] })).toEqual({
      header: { code: "1/4", hasLinkIndicator: false },
      body: { title: "标题" },
    });
    expect(cardSections({ code: "1/4", title: "标题", links: [{ link: "B", label: "B", path: "b.md", title: "B" }] })).toEqual({
      header: { code: "1/4", hasLinkIndicator: true },
      body: { title: "标题" },
    });
  });

  it("所有卡片使用一致的宽高", () => {
    expect(measureCard("1", "短标题")).toEqual(measureCard("1/24", "很长的标题内容"));
  });

  it("使用 B 方案的统一卡片尺寸", () => {
    expect(measureCard("1", "标题")).toEqual({ width: 240, height: 96 });
    expect(measureCard("1/24", "很长的标题内容", true)).toEqual({ width: 240, height: 96 });
  });

  it("查看 1/4 时生成主线、数字上分支和字母下分支", () => {
    const result = layout("1/4");
    const current = result.cards.find((card) => card.code === "1/4")!;
    const numeric = result.cards.filter((card) => ["1/41", "1/42"].includes(card.code));
    const letters = result.cards.filter((card) => ["1/4a", "1/4b"].includes(card.code));

    expect(result.cards).toHaveLength(10);
    expect(numeric.every((card) => card.y + card.h < current.y)).toBe(true);
    expect(letters.every((card) => card.y > current.y + current.h && card.x > current.x + current.w / 2)).toBe(true);
    expect(result.markers.every((marker) => marker.x >= 0 && marker.y >= 0)).toBe(true);
  });

  it("查看字母分支时使用共享虚线主干和右偏卡片", () => {
    const result = layout("1/4a");
    const parent = result.cards.find((card) => card.code === "1/4")!;
    const current = result.cards.find((card) => card.code === "1/4a")!;
    const spine = result.edges.filter(
      (edge) => edge.kind === "vbar" && edge.dashed && edge.sourceId === "1/4" && edge.groupId?.startsWith("branch-spine")
    );

    // 来源行 5 张 + 题外话主行 3 张（1/4a、1/4a1、1/4a2）+ 后续兄弟 1 张（1/4b）
    expect(result.cards).toHaveLength(9);
    expect(current.x).toBeGreaterThan(parent.x + parent.w / 2);
    expect(current.y).toBeGreaterThan(parent.y + parent.h);
    expect(spine).toHaveLength(1);
    expect(result.edges.some((edge) => edge.kind === "cont" && edge.sourceId === "1/4")).toBe(true);
  });

  it("题外话首层数字卡与题外话父级保持在下方主行", () => {
    const result = layout("1/4a2");
    const parent = result.cards.find((card) => card.code === "1/4a")!;
    const first = result.cards.find((card) => card.code === "1/4a1")!;
    const current = result.cards.find((card) => card.code === "1/4a2")!;

    expect(parent.y).toBe(first.y);
    expect(first.y).toBe(current.y);
    expect(parent.x).toBeLessThan(first.x);
    expect(first.x).toBeLessThan(current.x);
  });

  it("所有卡片互不重叠，节点和连线均落在画布范围内", () => {
    for (const code of CARDS) {
      const result = layout(code);
      for (let i = 0; i < result.cards.length; i++) {
        const card = result.cards[i];
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.y).toBeGreaterThanOrEqual(0);
        expect(card.x + card.w).toBeLessThanOrEqual(result.width);
        expect(card.y + card.h).toBeLessThanOrEqual(result.height);
        for (let j = i + 1; j < result.cards.length; j++) {
          expect(overlaps(card, result.cards[j]), `${code}: ${card.code} overlaps ${result.cards[j].code}`).toBe(false);
        }
      }
      for (const edge of result.edges) {
        const points = edge.points ?? [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
        expect(points.every((point) => point.x >= 0 && point.x <= result.width && point.y >= 0 && point.y <= result.height)).toBe(true);
      }
    }
  });
});

import { expect, it } from "vitest";
import { ThreadIndex, computeView } from "../src/model";
import { layoutView } from "../src/renderer";

it("把正文双链从记录传递到当前布局卡片", () => {
  const index = new ThreadIndex([
    { path: "a.md", basename: "A", no: "1", links: [
      { link: "B", label: "B", path: "b.md", title: "B" },
    ] },
    { path: "b.md", basename: "B", no: "1/1", links: [] },
  ]);

  const layout = layoutView(computeView(index, "1")!);
  expect(layout.cards.find((card) => card.code === "1")?.links).toEqual([
    { link: "B", label: "B", path: "b.md", title: "B" },
  ]);
});

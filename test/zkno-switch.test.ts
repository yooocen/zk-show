import { describe, expect, it } from "vitest";
import { deriveZkNoSwitchOptions } from "../src/zkno-switch";
import { TopicGraph } from "../src/topic-graph";

describe("deriveZkNoSwitchOptions", () => {
  it("按先后顺序去重根话题，标题取真实根/幽灵回退编码", () => {
    const graph = new TopicGraph([
      { path: "r1.md", basename: "数学", no: "1" },
      { path: "a.md", basename: "多主题", no: "1/4a" },
      { path: "a.md", basename: "多主题", no: "2/3b" },
      { path: "a.md", basename: "多主题", no: "1/2" },
    ]);

    expect(deriveZkNoSwitchOptions(["1/4a", "2/3b", "1/2"], graph)).toEqual([
      { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
      { rootCode: "2", rootTitle: "2", zkNo: "2/3b" },
    ]);
  });
});

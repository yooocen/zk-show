import { describe, expect, it } from "vitest";
import { closeHint, hintDescription, popoverPosition, toggleHint, toggleLink } from "../src/hidden-hint-popover";

describe("hidden hint popover helpers", () => {
  it("toggles one open marker and closes the same marker", () => {
    expect(toggleHint(null, "a")).toBe("a");
    expect(toggleHint("a", "a")).toBeNull();
    expect(toggleHint("a", "b")).toBe("b");
    expect(closeHint("a")).toBeNull();
  });

  it("flips independently when a popover would overflow", () => {
    expect(popoverPosition({ x: 780, y: 580 }, { width: 800, height: 620 }, { width: 240, height: 180 })).toMatchObject({
      side: "left",
      vertical: "above",
    });
  });

  it("describes the marker source", () => {
    expect(hintDescription({ kind: "offTopic", sourceId: "1/13" })).toContain("1/13");
  });

  it("切换正文双链弹出层", () => {
    expect(toggleLink(null, "1")).toBe("1");
    expect(toggleLink("1", "1")).toBeNull();
    expect(toggleLink("1", "2")).toBe("2");
  });
});

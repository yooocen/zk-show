import { describe, it, expect } from "vitest";
import { parseZettelkastenNo, normalizeZettelkastenNo } from "../src/parser";

describe("parseZettelkastenNo", () => {
  it("仅根", () => {
    expect(parseZettelkastenNo("1")).toEqual({ path: ["1"], canonical: "1", parent: null });
  });

  it("数字继续 1/41 → 子级 4 → 1", () => {
    expect(parseZettelkastenNo("1/41")).toEqual({
      path: ["1", "4", "1"],
      canonical: "1/41",
      parent: "1/4",
    });
  });

  it("字母题外话 1/4a", () => {
    expect(parseZettelkastenNo("1/4a")).toEqual({
      path: ["1", "4", "a"],
      canonical: "1/4a",
      parent: "1/4",
    });
  });

  it("题外话继续 1/4a1", () => {
    expect(parseZettelkastenNo("1/4a1")).toEqual({
      path: ["1", "4", "a", "1"],
      canonical: "1/4a1",
      parent: "1/4a",
    });
  });

  it("数字叠加 2/111", () => {
    expect(parseZettelkastenNo("2/111")).toEqual({
      path: ["2", "1", "1", "1"],
      canonical: "2/111",
      parent: "2/11",
    });
  });

  it("number 类型", () => {
    expect(parseZettelkastenNo(2)).toEqual({ path: ["2"], canonical: "2", parent: null });
  });

  it("容忍内部多余斜杠 2/1/1", () => {
    expect(parseZettelkastenNo("2/1/1")).toEqual({
      path: ["2", "1", "1"],
      canonical: "2/11",
      parent: "2/1",
    });
  });

  it("引号包裹", () => {
    expect(parseZettelkastenNo('"1/4a"')).toEqual({
      path: ["1", "4", "a"],
      canonical: "1/4a",
      parent: "1/4",
    });
  });

  it("无效输入 → null", () => {
    expect(parseZettelkastenNo("")).toBeNull();
    expect(parseZettelkastenNo("   ")).toBeNull();
    expect(parseZettelkastenNo(null)).toBeNull();
    expect(parseZettelkastenNo(undefined)).toBeNull();
    expect(parseZettelkastenNo({})).toBeNull();
    expect(parseZettelkastenNo("/1")).toBeNull();
  });

  it("normalizeZettelkastenNo 返回规范码", () => {
    expect(normalizeZettelkastenNo("1/4a1")).toBe("1/4a1");
    expect(normalizeZettelkastenNo(3)).toBe("3");
    expect(normalizeZettelkastenNo("")).toBeNull();
  });
});
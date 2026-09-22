import { describe, expect, it } from "vitest";
import { formatUnit, isDigitUnit, isLetterUnit, lastUnit, unitNumber } from "../src/model-units";

describe("model-units", () => {
  it("isDigitUnit 接受单数字与括号多位", () => {
    expect(isDigitUnit("9")).toBe(true);
    expect(isDigitUnit("(10)")).toBe(true);
    expect(isDigitUnit("a")).toBe(false);
    expect(isDigitUnit("(a)")).toBe(false);
    expect(isDigitUnit("(5)")).toBe(false);
    expect(isDigitUnit("(010)")).toBe(false);
  });

  it("isLetterUnit 仅接受单字母", () => {
    expect(isLetterUnit("a")).toBe(true);
    expect(isLetterUnit("(10)")).toBe(false);
  });

  it("formatUnit 多位数字加括号，其余原样", () => {
    expect(formatUnit("10")).toBe("(10)");
    expect(formatUnit("9")).toBe("9");
    expect(formatUnit("a")).toBe("a");
    expect(formatUnit("(10)")).toBe("(10)");
    expect(formatUnit("010")).toBe("010");
  });

  it("unitNumber 解析括号与单数字", () => {
    expect(unitNumber("(10)")).toBe(10);
    expect(unitNumber("(11)")).toBe(11);
    expect(unitNumber("9")).toBe(9);
    expect(unitNumber("(010)")).toBeNaN();
  });

  it("lastUnit 取末尾单元，根码返回整串", () => {
    expect(lastUnit("1/4a")).toBe("a");
    expect(lastUnit("1/(10)")).toBe("(10)");
    expect(lastUnit("1/1(11)")).toBe("(11)");
    expect(lastUnit("10")).toBe("10");
  });
});

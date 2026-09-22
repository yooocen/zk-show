# 括号多位数单元（1/(10) 等）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持数字单元超过 9 的 zettelkastenNo 写法：`/` 之后的单元 ≥10 时用括号 `(n)` 表示单个单元（如 `1/(10)`、`1/1(11)`），纯扩展不影响现有 1-9 单字符解析，根话题多位（如 `10/1`）不加括号。

**Architecture:** 单元判定与工具集中到 `src/model-units.ts`（isDigitUnit/formatUnit/unitNumber/lastUnit）；`src/parser.ts` 后缀改括号分组分词；`src/topic-graph.ts` 祖先编码与兄弟排序用新工具；`src/zkno-form-modal.ts` 推断/校验支持括号单元。

**Tech Stack:** TypeScript、vitest。

---

## 文件结构

- Modify: `src/model-units.ts` — isDigitUnit 扩展 + formatUnit/unitNumber/lastUnit
- Modify: `src/parser.ts` — 括号分词 + canonicalOf 用 formatUnit
- Modify: `src/topic-graph.ts` — canonicalFromPath/compareNodes 用新工具
- Modify: `src/zkno-form-modal.ts` — 推断/校验/拼接支持括号
- Test: `test/model-units.test.ts`（新增）、`test/parser.test.ts`、`test/topic-graph.test.ts`、`test/model.test.ts`

运行测试：`npm test`（`vitest run`）。构建：`npm run build`。忽略工作区未跟踪文件（main.js、src/index-fingerprint.ts、test/index-fingerprint.test.ts）。

---

### Task 1: `src/model-units.ts` 工具函数

**Files:**
- Modify: `src/model-units.ts`
- Create: `test/model-units.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/model-units.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { formatUnit, isDigitUnit, isLetterUnit, lastUnit, unitNumber } from "../src/model-units";

describe("model-units", () => {
  it("isDigitUnit 接受单数字与括号多位", () => {
    expect(isDigitUnit("9")).toBe(true);
    expect(isDigitUnit("(10)")).toBe(true);
    expect(isDigitUnit("a")).toBe(false);
    expect(isDigitUnit("(a)")).toBe(false);
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
  });

  it("unitNumber 解析括号与单数字", () => {
    expect(unitNumber("(10)")).toBe(10);
    expect(unitNumber("(11)")).toBe(11);
    expect(unitNumber("9")).toBe(9);
  });

  it("lastUnit 取末尾单元，根码返回整串", () => {
    expect(lastUnit("1/4a")).toBe("a");
    expect(lastUnit("1/(10)")).toBe("(10)");
    expect(lastUnit("1/1(11)")).toBe("(11)");
    expect(lastUnit("10")).toBe("10");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/model-units.test.ts`
Expected: FAIL，`Cannot find module '../src/model-units'` 或 `formatUnit is not a function`

- [ ] **Step 3: 实现**

`src/model-units.ts` 整体替换为：

```ts
export function isDigitUnit(ch: string): boolean {
  return /^[0-9]$/.test(ch) || /^\([0-9]+\)$/.test(ch);
}

export function isLetterUnit(ch: string): boolean {
  return /^[a-zA-Z]$/.test(ch);
}

/** 多位数字单元加括号，如 "10" → "(10)"；其他原样返回。 */
export function formatUnit(unit: string): string {
  return /^[0-9]{2,}$/.test(unit) ? `(${unit})` : unit;
}

/** 解析单元数值："(10)" → 10，"9" → 9。 */
export function unitNumber(unit: string): number {
  const m = /^\(([0-9]+)\)$/.exec(unit);
  return m ? Number(m[1]) : Number(unit);
}

/** 从规范码词法取末尾单元；无 "/" 时返回整串（根本身即一个单元）。 */
export function lastUnit(code: string): string {
  const slash = code.lastIndexOf("/");
  if (slash < 0) return code;
  const tail = code.slice(slash + 1);
  if (tail.endsWith(")")) {
    const open = tail.lastIndexOf("(");
    if (open >= 0) return tail.slice(open);
  }
  return tail[tail.length - 1];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/model-units.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/model-units.ts test/model-units.test.ts
git commit -m "feat: 单元工具支持括号多位数（formatUnit/unitNumber/lastUnit）"
```

---

### Task 2: `src/parser.ts` 括号分词

**Files:**
- Modify: `src/parser.ts`
- Test: `test/parser.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/parser.test.ts` 的 `describe("parseZettelkastenNo")` 内追加：

```ts
  it("括号多位单元 1/(10)", () => {
    expect(parseZettelkastenNo("1/(10)")).toEqual({
      path: ["1", "(10)"],
      canonical: "1/(10)",
      parent: "1",
    });
  });

  it("括号多位叠加 1/1(11)", () => {
    expect(parseZettelkastenNo("1/1(11)")).toEqual({
      path: ["1", "1", "(11)"],
      canonical: "1/1(11)",
      parent: "1/1",
    });
  });

  it("括号后接题外话 1/(10)a", () => {
    expect(parseZettelkastenNo("1/(10)a")).toEqual({
      path: ["1", "(10)", "a"],
      canonical: "1/(10)a",
      parent: "1/(10)",
    });
  });

  it("多位根不加括号 10/1", () => {
    expect(parseZettelkastenNo("10/1")).toEqual({
      path: ["10", "1"],
      canonical: "10/1",
      parent: "10",
    });
  });

  it("非法括号返回 null", () => {
    expect(parseZettelkastenNo("1/(10")).toBeNull();
    expect(parseZettelkastenNo("1/(a)")).toBeNull();
    expect(parseZettelkastenNo("1/()")).toBeNull();
  });
```

在 `describe("parseZettelkastenNoList")` 内追加：

```ts
  it("多编码含括号", () => {
    expect(parseZettelkastenNoList("1/(10), 2/3")).toEqual(["1/(10)", "2/3"]);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/parser.test.ts`
Expected: FAIL（`1/(10)` 被解析为 `["1","(","1","0"]`，断言不匹配）

- [ ] **Step 3: 实现**

`src/parser.ts` 顶部导入改为：

```ts
import { formatUnit } from "./model-units";
```

将 `canonicalOf` 替换为：

```ts
function canonicalOf(path: string[]): string {
  if (path.length <= 1) return path[0];
  return path[0] + "/" + path.slice(1).map(formatUnit).join("");
}
```

将 `parseZettelkastenNo` 中这一行：

```ts
  const units = suffixRaw.replace(/\//g, "").split("");
```

替换为：

```ts
  const units = tokenizeSuffixUnits(suffixRaw.replace(/\//g, ""));
  if (units === null) {
    return null;
  }
```

在 `parseZettelkastenNo` 之后追加分词函数：

```ts
/** 把后缀（去斜杠后）切分为单元：括号组一个单元，其余单字符一个单元。非法括号返回 null。 */
function tokenizeSuffixUnits(s: string): string[] | null {
  const units: string[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "(") {
      const end = s.indexOf(")", i + 1);
      if (end === -1) return null;
      const inner = s.slice(i + 1, end);
      if (!/^[0-9]+$/.test(inner)) return null;
      units.push(s.slice(i, end + 1));
      i = end + 1;
    } else {
      units.push(ch);
      i += 1;
    }
  }
  return units;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/parser.test.ts`
Expected: PASS（含新增用例）

- [ ] **Step 5: 提交**

```bash
git add src/parser.ts test/parser.test.ts
git commit -m "feat: 解析支持括号多位数单元"
```

---

### Task 3: `src/topic-graph.ts` 建图与排序

**Files:**
- Modify: `src/topic-graph.ts`
- Test: `test/topic-graph.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/topic-graph.test.ts` 的 `describe("TopicGraph")` 内追加：

```ts
  it("括号多位视为数字继续并数值排序", () => {
    const graph = new TopicGraph(
      ["1", "1/9", "1/(10)", "1/(11)", "1/(10)a"].map((code, i) => ({
        path: `k${i}.md`,
        basename: `卡${i}`,
        no: code,
      }))
    );

    expect(graph.node("1/(10)")?.edgeKind).toBe("continuation");
    expect(graph.node("1/(10)a")?.edgeKind).toBe("offTopic");
    expect(graph.node("1/(10)")?.parentId).toBe("1");
    expect(graph.children("1", "continuation").map((n) => n.code)).toEqual(["1/9", "1/(10)", "1/(11)"]);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/topic-graph.test.ts`
Expected: FAIL（`graph.children("1","continuation")` 顺序为 `["1/(10)","1/(11)","1/9"]` 或 `(10)` 未被识别为 continuation）

- [ ] **Step 3: 实现**

`src/topic-graph.ts` 顶部导入改为：

```ts
import { formatUnit, isDigitUnit, isLetterUnit, lastUnit, unitNumber } from "./model-units";
```

将 `canonicalFromPath` 替换为：

```ts
function canonicalFromPath(path: string[]): string {
  if (path.length <= 1) return path[0];
  return path[0] + "/" + path.slice(1).map(formatUnit).join("");
}
```

将 `compareNodes` 替换为：

```ts
function compareNodes(a: TopicGraphNode, b: TopicGraphNode, kind: TopicEdgeKind): number {
  const au = lastUnit(a.code);
  const bu = lastUnit(b.code);
  if (kind === "continuation") {
    const delta = unitNumber(au) - unitNumber(bu);
    if (delta !== 0) return delta;
  } else {
    const delta = au.toLowerCase().localeCompare(bu.toLowerCase());
    if (delta !== 0) return delta;
  }
  return a.code.localeCompare(b.code);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/topic-graph.test.ts`
Expected: PASS（含新增用例）

- [ ] **Step 5: 提交**

```bash
git add src/topic-graph.ts test/topic-graph.test.ts
git commit -m "feat: 建图与兄弟排序支持括号多位数单元"
```

---

### Task 4: 投影回归测试（`src/model.ts`）

**Files:**
- Test: `test/model.test.ts`

- [ ] **Step 1: 写测试**

在 `test/model.test.ts` 的 `describe("computeView 兼容入口")` 内追加：

```ts
  it("括号多位编码投影到主行链", () => {
    const graph = new ThreadIndex([
      { path: "root.md", basename: "根", no: "1" },
      { path: "a.md", basename: "卡9", no: "1/9" },
      { path: "b.md", basename: "卡10", no: "1/(10)" },
      { path: "c.md", basename: "卡11", no: "1/(11)" },
    ]);
    const view = computeView(graph, "1/(10)")!;
    expect(codes(view.baseLane)).toEqual(["1", "1/9", "1/(10)", "1/(11)"]);
    expect(view.baseLane.cards.filter((card) => card.isCurrent).map((card) => card.code)).toEqual(["1/(10)"]);
  });
```

- [ ] **Step 2: 运行确认通过**

Run: `npx vitest run test/model.test.ts`
Expected: PASS（依赖 Task 1-3 已完成；若之前实现正确则直接通过）

- [ ] **Step 3: 提交**

```bash
git add test/model.test.ts
git commit -m "test: 括号多位数编码的图谱投影回归"
```

---

### Task 5: `src/zkno-form-modal.ts` 推断与校验

**Files:**
- Modify: `src/zkno-form-modal.ts`

- [ ] **Step 1: 改导入**

`src/zkno-form-modal.ts` 顶部追加导入：

```ts
import { formatUnit, isDigitUnit, isLetterUnit, lastUnit, unitNumber } from "./model-units";
```

- [ ] **Step 2: `candidateKind` 用新判定**

将：

```ts
  private candidateKind(code: string): string {
    const unit = parseZettelkastenNo(code)?.path.slice(-1)[0] ?? "";
    if (/^[0-9]$/.test(unit)) return "继续讨论";
    if (/^[a-zA-Z]$/.test(unit)) return "题外话";
    return "";
  }
```

替换为：

```ts
  private candidateKind(code: string): string {
    const unit = parseZettelkastenNo(code)?.path.slice(-1)[0] ?? "";
    if (isDigitUnit(unit)) return "继续讨论";
    if (isLetterUnit(unit)) return "题外话";
    return "";
  }
```

- [ ] **Step 3: `validateManual` 允许括号单元**

将：

```ts
    const units = parsed.path.slice(1);
    if (!units.every((u) => /^[0-9a-zA-Z]$/.test(u))) {
      return { code: null, error: "编码不合法（后缀单元需为数字或字母）" };
    }
```

替换为：

```ts
    const units = parsed.path.slice(1);
    if (!units.every((u) => /^[0-9a-zA-Z]$/.test(u) || /^\([0-9]+\)$/.test(u))) {
      return { code: null, error: "编码不合法（后缀单元需为数字、字母或括号多位，如 1/(10)）" };
    }
```

- [ ] **Step 4: `computeCandidates` 数字不限 9、末单元用新工具**

将：

```ts
    const digits = this.index.digitChildren(parentCode);
    let maxDigit = 0;
    for (const n of digits) {
      const unit = n.code[n.code.length - 1] ?? "";
      const d = Number(unit);
      if (!Number.isNaN(d) && d > maxDigit) maxDigit = d;
    }
    const nextDigit = maxDigit + 1;
    if (nextDigit <= 9) out.push(this.appendUnit(parentCode, String(nextDigit)));
```

替换为：

```ts
    const digits = this.index.digitChildren(parentCode);
    let maxDigit = 0;
    for (const n of digits) {
      const d = unitNumber(lastUnit(n.code));
      if (!Number.isNaN(d) && d > maxDigit) maxDigit = d;
    }
    const nextDigit = maxDigit + 1;
    out.push(this.appendUnit(parentCode, formatUnit(String(nextDigit))));
```

将字母分支：

```ts
    const letters = this.index.letterChildren(parentCode);
    let maxLetter = "";
    for (const n of letters) {
      const unit = (n.code[n.code.length - 1] ?? "").toLowerCase();
```

替换为：

```ts
    const letters = this.index.letterChildren(parentCode);
    let maxLetter = "";
    for (const n of letters) {
      const unit = lastUnit(n.code).toLowerCase();
```

- [ ] **Step 5: `appendUnit` 拼接加括号**

将：

```ts
  private appendUnit(parentCode: string, unit: string): string {
    const p = parseZettelkastenNo(parentCode);
    if (!p) return `${parentCode}${unit}`;
    const newPath = [...p.path, unit];
    return newPath.length <= 1 ? newPath[0] : `${newPath[0]}/${newPath.slice(1).join("")}`;
  }
```

替换为：

```ts
  private appendUnit(parentCode: string, unit: string): string {
    const p = parseZettelkastenNo(parentCode);
    if (!p) return `${parentCode}${formatUnit(unit)}`;
    const newPath = [...p.path, unit];
    return newPath.length <= 1 ? newPath[0] : `${newPath[0]}/${newPath.slice(1).map(formatUnit).join("")}`;
  }
```

- [ ] **Step 6: 类型检查与全量测试**

Run: `npx tsc --noEmit`，Expected: 除预存未跟踪 test/index-fingerprint.test.ts 外无错误。
Run: `npm test`，Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/zkno-form-modal.ts
git commit -m "feat: zkno 表单推断与校验支持括号多位数"
```

---

### Task 6: 全量验证与推送

**Files:** 无

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 无报错，产出 `main.js`

- [ ] **Step 3: 推送知识库插件目录**

```bash
Copy-Item -LiteralPath "E:\dev\zk-show\main.js" -Destination "C:\Users\cc\7adiu-d2vq6\技术和学习记录\.obsidian\plugins\zk-show" -Force
Copy-Item -LiteralPath "E:\dev\zk-show\styles.css" -Destination "C:\Users\cc\7adiu-d2vq6\技术和学习记录\.obsidian\plugins\zk-show" -Force
```

- [ ] **Step 4: 手工冒烟清单（Obsidian 内）**
  1. 笔记 frontmatter 写 `zettelkastenNo: "1/(10)"` → 图谱聚焦 1/(10)，主行显示 `1/9 → 1/(10) → 1/(11)`（按数值序）
  2. 写 `1/1(11)` → 图谱按 根1 → 单元1 → 单元11 建链
  3. zkno 表单「插件推断」：在父卡 `1/9` 下推断出 `1/(10)` 候选；在 `1/(10)` 下继续可出 `1/(11)`
  4. 手动输入 `1/(10`、`1/(a)` → 表单报非法
  5. 无括号的 `1/10` 仍按旧语义（单元 1、0）

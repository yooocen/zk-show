# 卡片标题两行截断与统一高度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将卡片统一提高到 240×96px，并让标题最多展示两行、第二行仍超出时才省略。

**Architecture:** 保持现有布局数据流不变：`measureCard` 提供固定矩形尺寸，布局求解与路由继续消费该尺寸，`styles.css` 负责标题的两行视觉截断。通过渲染器测试锁定统一尺寸，避免标题文本进入数据层预处理。

**Tech Stack:** TypeScript、Vitest、CSS、esbuild。

---

### Task 1: 锁定统一卡片尺寸的回归测试

**Files:**
- Modify: `test/renderer.test.ts:29-31`

- [ ] **Step 1: 添加固定尺寸断言**

在“所有卡片使用一致的宽高”测试之后加入：

```ts
  it("使用 B 方案的统一卡片尺寸", () => {
    expect(measureCard("1", "标题")).toEqual({ width: 240, height: 96 });
    expect(measureCard("1/24", "很长的标题内容", true)).toEqual({ width: 240, height: 96 });
  });
```

- [ ] **Step 2: 运行该测试并确认当前实现失败**

运行：`npm test -- test/renderer.test.ts`

预期：新增测试失败，实际高度为 72 而不是 96。

### Task 2: 将布局卡片高度调整为 96px

**Files:**
- Modify: `src/layout/geometry.ts:1-5`

- [ ] **Step 1: 修改布局常量**

将：

```ts
  cardHeight: 72,
```

改为：

```ts
  cardHeight: 96,
```

`measureCard` 保持固定返回 `LAYOUT_METRICS.cardWidth` 和 `LAYOUT_METRICS.cardHeight`，不增加按标题测量逻辑。

- [ ] **Step 2: 运行尺寸测试并确认通过**

运行：`npm test -- test/renderer.test.ts`

预期：`test/renderer.test.ts` 全部通过，新增尺寸断言得到 240×96。

### Task 3: 实现标题最多两行并在第二行后省略

**Files:**
- Modify: `styles.css:351-361`

- [ ] **Step 1: 替换标题规则**

将 `.zk-show-card .zk-show-title` 规则调整为：

```css
.zk-show-card .zk-show-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0.01em;
  color: var(--text-normal);
  white-space: normal;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
}
```

保留 `.zk-show-card-body` 的垂直居中规则和 `.zk-show-card.is-current` 的颜色覆盖，不修改编码区域规则。

- [ ] **Step 2: 检查样式规则唯一性**

运行：`rg -n -C 4 "zk-show-title|line-clamp|white-space" styles.css`

预期：卡片标题只剩新的两行截断规则；编码和弹出提示标题仍保留各自的单行规则。

### Task 4: 完整验证与交付检查

**Files:**
- Verify: `src/layout/geometry.ts`
- Verify: `styles.css`
- Verify: `test/renderer.test.ts`

- [ ] **Step 1: 运行完整测试**

运行：`npm test`

预期：所有 Vitest 测试通过，布局回归中的卡片边界、重叠和关系线检查均通过。

- [ ] **Step 2: 运行生产构建**

运行：`npm run build`

预期：TypeScript/esbuild 构建成功并生成更新后的 `main.js`；不修改源代码之外的配置。

- [ ] **Step 3: 检查最终差异**

运行：`git diff -- src/layout/geometry.ts styles.css test/renderer.test.ts`

预期：差异只包含 96px 尺寸、两行标题 CSS 和对应回归断言；不包含无关文件修改。

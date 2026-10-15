# 题外话兄弟卡片全量展示设计

- 日期：2026-10-15
- 状态：已确认
- 涉及文件：`src/focus-projection.ts`、`src/layout/compiler.ts`、`src/layout/solver.ts`、`src/layout/regions.ts`、`src/layout/router.ts`、`src/hidden-hint-markers.ts`、`test/`

## 背景与目标

2026-08-17 通用图布局设计第 3 条的规则是：字母直接子级只保留**焦点以前**的同级节点作为来源，焦点以后的同级分支折叠为提示。于是查看 `1/14a` 时，`1/14` 下的 `1/14b`、`1/14c` 根本不出现，只在共享虚线主干末端多伸出一截 `verticalHintLength` 暗示"后面还有"。

这条规则的实际后果是：题外话分支最需要"看到全貌"的场景——一个锚点下有多个兄弟题外话——反而看不到兄弟，必须先点开提示才知道有哪些。

目标：查看题外话主行上的任意卡（`1/14a`，以及主行上的数字继续卡 `1/14a1`）时，锚点（`1/14`）下的**所有**字母兄弟都显示为卡片；并且每张兄弟卡自己的提示线（它的后续数字、它自己的题外话）照常显示。

## 现状与问题

用真实管线（`computeView → compileLayoutGraph → solveLayout → routeEdges`）对合成场景

```text
1/14  ── 1/14a（焦点） 1/14b（有后续 b1、b2，也有自己的题外话 ba） 1/14c（有后续 c1，也有自己的题外话 ca）
```

测得的现状：

| 现象 | 修复前 |
| --- | --- |
| `1/14b`、`1/14c` 是否可见 | 不可见，只体现在主干末端的 `extend` 延伸 |
| 兄弟卡的"后续数字"提示线 | 已生成：实线短横线挂在卡右侧，`1/14b → cont [[520,338],[570,338]]` |
| 兄弟卡的"自己的题外话"提示线 | **位置错误**：兄弟列间距 `verticalGap = 24` 比提示线长度 `verticalHintLength = 25` 还小 1px，中间兄弟的虚线无法垂直挂在卡下方，只能绕过下一张卡：`1/14b → poly(dashed) [[400,386],[248,386],[248,411]]`，线头落在 `1/14c` 左上角旁边 |

即：兄弟卡自身的提示线本来就在生成（`addHiddenChildHints` 对 `previous` 泳道卡生效），但**列内没有为这条提示线留位置**，所以中间兄弟的虚线画出来是"挂错了地方"的绕行折线；一旦两侧通道都被占，`routeHint` 会遍历候选通道后放弃，提示线连同它的可点击圆点一起静默消失。

## 规则

### 1. 投影（`src/focus-projection.ts`）

- `ProjectionLaneRole` 增加 `following`；`FocusProjection` 增加 `followingLane: ProjectionLane | null`。
- `projectOffTopicLine`：取 `allLetters = graph.letterChildren(anchorId)`，焦点之前 → 现有 `previous` 泳道，焦点之后 → 新增 `following` 泳道（`vertical` / `below` / `offTopic` / `anchorId`）。
- 适用焦点：题外话主行上的任意卡，即 `focus.code === origin.code` 或 `focus.parentId === origin.code`；`1/14a` 与 `1/14a1` 同等处理。
- `addHiddenChildHints` 的 lanes 集合与可见集合纳入 `followingLane`：
  - 锚点下的字母兄弟全部可见后，锚点自身不再产生 `offTopic` 隐藏提示；
  - 兄弟卡（`previous` 与 `following`）仍参与隐藏提示计算——后续数字 → `continuation` / `trailing`；自己的题外话 → `offTopic` / `below`。这是本次明确保留的语义，不允许因为"兄弟已全部展开"而顺手省掉。

### 2. 布局（`compiler` / `solver` / `regions`）

- compiler：`sourceLanes` 纳入 `followingLane`；`branch-spine` 的 `targetIds` 与 `rightOf` 约束改为 `previous 卡… + 焦点卡 + following 卡…`，共享虚线主干串起全部兄弟。
- solver：`previous 竖列 → 焦点行 → following 竖列`，三者在同一 x 列；列内默认 `verticalGap`。
- **新增列内预留规则（本次核心修复）**：竖列中某张卡带 `placement: "below"` 的提示时，它之后额外预留 `verticalHintLength`。预留后 `1/14b` 的题外话虚线从绕行折线变成垂直段 `vbar(dashed) [[400,386],[400,411]]`，`1/14c` 相应下移 25px（`y=410 → 435`）。预留只作用于 `previous` 与 `following` 两个竖列内部的卡间距；焦点行由 `placeHorizontal` 摆放，它到 `following` 竖列的起始位置仍是 `焦点行高度 + verticalGap`（焦点卡的直接子级都已展开成卡片，不会有 `below` 提示）。
- `laneGroup`（`solver`）与 `buildLaneRegions`（`regions`）：`previous + branch + following` 视为同一区域组，组内维持紧凑间距，不被 `rowGap` 拆开；`envelope` 对 `below` 提示的区域底边补偿保持不变（预留后不再依赖它兜底）。

### 3. 清理不可达的 `extend` 机制

规则改变后，"后续兄弟折叠成主干延伸"没有任何生产者，被判为死代码并删除：

- `HiddenHint.extend` 字段、`ProjectionLane.extendSpine` 字段（后者在改动前已无消费者）
- `compiler.ts` 中把 `extend` 提示并入 `branch-spine` 的分支，以及 spine 边的 `extend`
- `router.ts` 中 `routeSpine` 依据 `extend` 延长端点的逻辑
- `hidden-hint-markers.ts` 中 `isMergedIntoSpine` / `mergedSpineEdge` 两条合并路径及其测试

`offTopic` 提示本身保留：来源行上其他卡（例如查看 `1/11` 时的 `1/13 → 1/13a`）仍然使用它。

## 非目标

- 不改变数字继续链、来源行截断规则和 `fold` 折线规则。
- 不改变渲染器接口、卡片样式与提示圆点交互。
- 不为"兄弟数量很多"另做分页或折叠阈值：本次一律全量显示。

## 测试

- `test/focus-projection.test.ts`：`1/11c` → `previous [1/11a,1/11b]`、`following [1/11d]`、且不再有 `extend` 提示；`1/11a2` → `following [1/11b,1/11c,1/11d]`；锚点下没有后续兄弟时（如 `1/13a1`）行为不变。
- `test/layout-compiler.test.ts`：spine 的 `targetIds` 覆盖 `1/11a…1/11d`；`rightOf` 覆盖同一组；不再存在 `extend` 字段。
- `test/layout-router.test.ts`：主干末端不再多伸 `verticalHintLength`；每张可见兄弟卡仍生成横向接线。
- `test/layout-solver.test.ts`：`previous` / `following` 与焦点卡同列；**带 `below` 提示的竖列卡与其后一张卡的间距 ≥ `verticalGap + verticalHintLength`**；该提示线为垂直段而不是绕行折线。
- `test/renderer.test.ts`、`test/analyze-math.test.ts`：全部真实样例无卡片重叠、无裁切、无重复线段、线段不穿卡。
- 真实预览：重新生成 `preview-math.html` 后人工核对。

## 验收标准

- 查看 `1/14a`（锚点下有 `1/14b`、`1/14c`）时三张卡都显示，`1/14b`、`1/14c` 的后续实线提示与题外话虚线提示同时存在。
- 中间兄弟的题外话虚线垂直挂在它自己下方，不绕行、不压到相邻卡。
- 查看 `1/14a1` 与查看 `1/14a` 表现一致。
- `npm test` 全绿、`npx tsc --noEmit` 无错误、`npm run build` 通过。

## 顺带修复（独立提交，不影响上述规则）

仓库自带的开发预览脚本（`scripts/gen-math-preview.mjs`、`scripts/gen-preview.mjs`、`scripts/gen-real-preview.mjs`）在卡片的**直接子节点**里查找 `.zk-show-title` / `.zk-show-code`，而 `renderLayout` 把它们分别嵌在 `.zk-show-card-body` / `.zk-show-card-header` 内，导致 `preview-math.html`、`preview-real.html` 里所有卡片都是没有文字的空框。改为递归查找，让这两个预览文件恢复可用。

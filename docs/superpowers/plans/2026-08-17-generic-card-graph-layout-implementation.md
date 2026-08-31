# 通用卡片图布局引擎实施计划

> 设计依据：[2026-08-17-generic-card-graph-layout-design.md](../specs/2026-08-17-generic-card-graph-layout-design.md)

**目标：** 用分层、确定性的通用图布局管线替换当前条件式布局，完整实现卡片编码展示规则，并修复数学话题中的顺序、方向、连接、重叠和裁切问题。

**架构：** `ThreadIndex` 提供完整关系图；焦点投影器决定可见节点、泳道及隐藏提示；布局编译器产生业务无关的节点、边和约束；求解器输出几何坐标与正交路径；边界归一化后由现有 DOM/SVG 渲染入口消费。

**技术栈：** TypeScript、Vitest、SVG、esbuild、Obsidian 插件 API。

---

## 任务 1：固定图模型与直接父子边语义

**文件：**

- 新建：`src/topic-graph.ts`
- 新建：`test/topic-graph.test.ts`
- 调整：`src/model.ts`

### 1.1 先写失败测试

覆盖：

- 节点的 `parentId`、`edgeKind` 和 `siblingOrder`；
- `1/4a1` 相对 `1/4a` 为 `continuation`；
- `1/11a` 相对 `1/11` 为 `offTopic`；
- 数字和字母兄弟分别稳定排序；
- 缺失中间卡生成幽灵父节点；
- 重复编码继续保持首条记录。

运行：

```powershell
npm.cmd test -- test/topic-graph.test.ts
```

预期：新模块尚未存在，测试进入红灯。

### 1.2 实现最小图模型

新增：

```ts
type TopicEdgeKind = "continuation" | "offTopic";

interface TopicGraphNode {
  id: string;
  code: string;
  parentId: string | null;
  edgeKind: TopicEdgeKind | null;
  siblingOrder: number;
  path: string | null;
  title: string;
  isGhost: boolean;
}
```

让 `ThreadIndex` 组合或委托该图，保留 `note`、`digitChildren`、`letterChildren`、`line` 和 `topicLine` 兼容入口。

### 1.3 验证

```powershell
npm.cmd test -- test/topic-graph.test.ts test/parser.test.ts
```

## 任务 2：实现焦点投影器

**文件：**

- 新建：`src/focus-projection.ts`
- 新建：`test/focus-projection.test.ts`
- 调整：`src/model.ts`
- 调整：`test/model.test.ts`

### 2.1 先写失败测试

真实与合成样例：

- 查看 `1/12`，数值泳道为 `1/11,1/12,1/13,1/14,1/15`；
- 查看 `1/11a2`，同级数值泳道保留 `1/11a1,1/11a2`；
- 查看 `1/4a1`，当前泳道方向为 `above`；
- 查看 `1/4b`，`1/4a` 作为前置来源，后续字母兄弟生成隐藏提示；
- 只展开当前节点的直接数字和字母子级；
- 深层节点保留最近父级，远祖先生成 fold 描述。

运行：

```powershell
npm.cmd test -- test/focus-projection.test.ts
```

### 2.2 实现投影类型与选择规则

新增 `FocusProjection`、`ProjectionLane`、`HiddenHint`、`FoldedAncestor`。投影器只输出可见结构和关系，不输出坐标。

`computeView` 迁移为兼容适配器：短期内从 `FocusProjection` 映射到原 `ViewResult`，让主入口保持可运行；布局迁移完成后删除旧字段依赖。

### 2.3 更新冲突测试

将旧测试中以下错误预期调整为规则预期：

- 数值链从当前节点截断；
- 混合编码只要祖先含字母便统一向下；
- 数值前置兄弟被当作隐藏提示。

### 2.4 验证

```powershell
npm.cmd test -- test/focus-projection.test.ts test/model.test.ts
```

## 任务 3：定义业务无关的 LayoutGraph

**文件：**

- 新建：`src/layout/types.ts`
- 新建：`src/layout/compiler.ts`
- 新建：`test/layout-compiler.test.ts`

### 3.1 先写失败测试

断言投影编译后：

- 每张可见卡对应唯一 `LayoutNode`；
- 数值链产生水平同排、有序、位于父级上方的约束；
- 字母链产生下方、右偏和共享边组约束；
- 实线/虚线只由关系类型决定；
- 当前节点、来源节点和普通节点角色准确；
- 隐藏后续字母分支转换为 `extendsPastTarget`。

### 3.2 实现编译器

布局中间表示包含：

- `LayoutNode`：尺寸、泳道、顺序、角色；
- `LayoutEdge`：端口、样式、路由、共享组；
- `LayoutConstraint`：同排、上下、右偏、顺序和间距。

编译器不得读取编码字符串，只消费 `FocusProjection` 的语义字段。

### 3.3 验证

```powershell
npm.cmd test -- test/layout-compiler.test.ts
```

## 任务 4：实现确定性约束布局器

**文件：**

- 新建：`src/layout/solver.ts`
- 新建：`src/layout/geometry.ts`
- 新建：`test/layout-solver.test.ts`

### 4.1 先写失败测试

覆盖：

- 同泳道节点水平排列且顺序稳定；
- 数值泳道在父级上方；
- 字母泳道在父级下方并右偏；
- 纵向字母节点间隔至少为卡片高度加垂直间隔；
- 任意两张可见卡片矩形不相交；
- 相同输入连续求解得到完全相同坐标。

### 4.2 实现泳道放置与碰撞消解

使用布局常量集中配置：`canvasPadding`、`horizontalGap`、`verticalGap`、`branchIndent`、`edgeChannelGap`。

求解顺序：焦点泳道 → 来源锚点 → 上下分支 → 碰撞检测 → 沿泳道法向增距。

### 4.3 验证

```powershell
npm.cmd test -- test/layout-solver.test.ts
```

## 任务 5：实现端口路由、共享主干与边界归一化

**文件：**

- 新建：`src/layout/router.ts`
- 新建：`src/layout/normalize.ts`
- 新建：`test/layout-router.test.ts`
- 新建：`test/layout-normalize.test.ts`

### 5.1 先写失败测试

覆盖：

- 数值关系生成实线正交路径；
- 字母分支只有一条共享虚线主干；
- 每个可见字母节点都有横向虚线接入；
- 后续隐藏字母分支让主干延伸到最后可见节点之后；
- fold 路由连接最近父级并向远祖先方向折转；
- 路径线段不穿过非端点卡片；
- 卡片矩形、线段端点、折线点和提示端点全部落入最终画布。

### 5.2 实现路由与归一化

边路由统一输出 SVG 可消费的点列。归一化计算所有节点和边的联合包围盒，整体平移到画布内边距，并生成最终宽高。

### 5.3 验证

```powershell
npm.cmd test -- test/layout-router.test.ts test/layout-normalize.test.ts
```

## 任务 6：迁移渲染器

**文件：**

- 调整：`src/renderer.ts`
- 调整：`src/main.ts`
- 调整：`test/renderer.test.ts`
- 调整：`styles.css`（仅在现有 class 需要补充时）

### 6.1 先写渲染契约失败测试

断言：

- `layoutView` 产出的卡片和边全部来自 `NormalizedLayout`；
- 卡片仍保留 `code`、`path`、`title`、`isCurrent` 和提示状态；
- SVG 实线、虚线及折线类型可直接渲染；
- 点击所需 path 信息保持完整。

### 6.2 切换渲染管线

`layoutView` 调用：

```text
projectFocus → compileLayoutGraph → solveLayout → routeEdges → normalizeLayout
```

`renderLayout` 只创建 DOM 卡片和 SVG 路径，移除旧的 Form A/Form B 坐标分支。

### 6.3 验证

```powershell
npm.cmd test -- test/renderer.test.ts
npm.cmd run build
```

## 任务 7：把数学话题诊断转换为真实回归测试

**文件：**

- 调整：`test/analyze-math.test.ts`
- 调整：`test/render-11.test.ts`
- 可选新建：`test/fixtures/math-topic.ts`

### 7.1 提取共享 fixture

集中保存数学话题 25 张卡片，避免两个测试文件重复。

### 7.2 替换恒真断言

增加以下精确断言：

- `1/11` 与 `1/12` 的完整数值链顺序；
- 当前节点标记唯一；
- 字母子级主干、横向接线和右偏关系；
- 混合嵌套分支方向；
- 全部 25 个视图无卡片重叠；
- 全部 25 个视图中节点与边处于画布内；
- 相同方向提示线没有重复几何段。

### 7.3 验证

```powershell
npm.cmd test -- test/analyze-math.test.ts test/render-11.test.ts
```

## 任务 8：清理兼容层与失效字段

**文件：**

- 调整：`src/model.ts`
- 调整：`src/renderer.ts`
- 调整：相关测试

清理 `pathContainsLetter`、旧坐标条件分支、未消费的布局字段和方向相反的注释。保留对插件入口仍有价值的公开类型与函数名，降低外部调用变化。

验证：

```powershell
npm.cmd test
npx.cmd tsc --noEmit
```

## 任务 9：预览与最终验证

**文件：**

- 重新生成：`preview-math.html`
- 构建产物：`main.js`

执行：

```powershell
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
node scripts\gen-math-preview.mjs
```

视觉核对 `1/11`、`1/12`、`1/11a`、`1/11a1`、`1/13a` 和 `1/131a12`。确认完整同级链、直接边方向、共享虚线、折叠线、卡片间距和画布边界均满足设计。

## 完成标准

- 所有新增测试经历明确红灯并在实现后转绿。
- 全量测试、类型检查和生产构建通过。
- 数学话题全部视图满足节点、连线、无重叠与边界断言。
- 当前插件预览与已确认规则一致。
- 旧布局分支与恒真测试已清理。

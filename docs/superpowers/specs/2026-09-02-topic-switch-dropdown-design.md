# 切换 zk 话题下拉菜单 设计文档

- 日期：2026-09-02
- 状态：已确认
- 涉及文件：`src/main.ts`、`src/topic-graph.ts`、`styles.css`、`test/`

## 背景与目标

在 ZK Show 展示窗口的右上角增加一个固定下拉菜单「切换zk话题」，用户点击后可以下拉选择根话题（顶层编码如 `1`、`2`、`3`…），选中后跳转到对应根话题 md 文件并将图谱切换到该根话题。

关键约束：
- 下拉菜单**不随画布缩放平移**，固定在右上角，不可挪动。
- 根话题选项显示为「编码 - 标题」组合。

## 方案

复用现有 `.zk-show-combo-*` 自定义下拉样式（已用于 zettelkastenNo 表单），新建 `ZkShowView` 内的下拉组件，与画布平级、绝对定位到右上角。

### 结构

```
zk-show-root (position: relative)
├── .zk-show-topic-switch   ← 新增：absolute 右上角，z-index 高于画布
│   ├── 触发按钮「切换zk话题」
│   └── 下拉面板（每根话题一行：编码 + 标题）
└── .zk-show-canvas         ← 现有：可缩放平移
```

由于下拉在 `canvasEl` 之外，不受 `translate/scale` 变换影响，天然固定。

## 数据来源

根话题 = `TopicGraph.allNodes()` 中 `parentId === null` 的节点。

新增纯函数（放 `src/topic-graph.ts`）：

```ts
export interface RootTopicItem {
  code: string;
  title: string;
  isGhost: boolean;
}

export function collectRootTopics(graph: TopicGraph): RootTopicItem[]
```

- `code`：根话题编码
- `title`：`isGhost` 为 `false` 时为 `basename`（即 `node.title`），否则为编码
- `isGhost`：无实际 md 文件时 `true`

## 交互

- 点击触发按钮展开/收起下拉面板。
- 点击面板中某个根话题项 → `navigateToCode(code, path)`（打开根话题 md 文件 + 图谱切换到根话题），与点击卡片行为一致。
- 幽灵根话题（`isGhost`）显示但置灰禁用（`disabled`），不可选。
- 面板内点击需 `stopPropagation`，并将 `.zk-show-topic-switch` 加入现有 pointer 事件忽略列表，避免触发画布拖拽/缩放。

## 刷新时机

每次 `refresh()` 重建画布时同步重建下拉（根话题列表来自索引，索引变化后刷新时需保持一致）。

## 测试

- 新增 `test/topic-graph.test.ts` 或扩展之，覆盖 `collectRootTopics`：
  - 返回全部根话题
  - `code` / `title` / `isGhost` 字段正确
  - 非根话题不返回
  - 幽灵根话题标记正确

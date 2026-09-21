# 多 zkNo 支持 + 话题切换下拉 设计文档

- 日期：2026-09-21
- 状态：已确认
- 涉及文件：`src/parser.ts`、`src/main.ts`、`src/zkno-switch.ts`（新增）、`src/topic-graph.ts`、`styles.css`、`test/`

## 背景与目标

当前一个 md 文件只允许一个 `zettelkastenNo` 前台编码，图谱一次聚焦一张卡。现扩展为：

1. 一个 md 可以有**多个 zkNo**，frontmatter 里用逗号 / 空格 / 分号任意分隔，也支持 YAML 数组。
2. 图谱**一次聚焦一个 zkNo**（默认第一个，按 frontmatter 先后顺序），新增一个下拉框列出该文件涉及的**根话题**，选中后**只切换图谱聚焦**到对应 zkNo，**不切换当前 md**。
3. 用户切换过该 md 的话题后，**持久记住**，下次打开该 md 沿用上次话题。

## 规则与数据

### zkNo 编码解析（`src/parser.ts`）

新增纯函数：

```ts
export function parseZettelkastenNoList(value: unknown): string[]
```

- 输入可为 `number` / `string` / 数组（Obsidian YAML 把 `[1/4a, 2/3b]` 解析为数组；数组元素也可是 number/string）。
- 字符串：去外层引号后按 `/[,;\s]+/` 切分（合法 zkNo 只含数字/字母/`/`，分隔符安全）。
- 每段走现有 `parseZettelkastenNo` 归一化得到规范码；跳过非法段；**去重并保持先后顺序**。
- 返回空数组表示无有效编码。

### 索引（`src/main.ts` `collectRecords`）

- 每个 md：`codes = parseZettelkastenNoList(frontmatter.zettelkastenNo)`。
- 空数组 → 跳过该文件；否则每个编码压入一条 `ZRecord`（`no` 为该编码的规范码字符串），同路径多卡。
- `indexFingerprint` 无需改动（`String(r.no)` 已是单编码）。

### 视图聚焦解析（`ZkShowView`）

- `resolveActiveCode` 改为 `resolveActiveCodes(active): string[] | null`，返回当前文件的有序有效编码列表。
- 默认聚焦 `codes[0]`（按先后顺序）。
- 当前聚焦码决定：`plugin.data.lastTopicByPath[activePath]` 若属于 `codes` → 沿用（持久记忆即内存值，天然跨刷新生效）；否则 `codes[0]`。
- 点击卡片 / 键盘导航等走原 `navigateToCode` 路径，若目标卡路径即当前文件且属于 `codes`，同步更新记忆。

### 新增下拉组件（`src/zkno-switch.ts`，类 `ZkNoSwitch`）

- 仅当当前文件有 **≥2 个不同有效编码** 时显示。
- 选项 = 这些编码所属的**去重根话题**（按先后顺序），每行显示「根编码 + 根标题 + 该文件在此根下的 zkNo」。
- 选中某根话题 → 图谱聚焦到该文件在此根下的 zkNo，**不打开/切换任何文件**。
- 边界：同一根话题下有多个 zkNo 时，下拉只出现一行，聚焦该根下第一个 zkNo（其余仍可通过点卡跳转）。
- 复用 `.zk-show-topic-switch-*` 样式，绝对定位在现有「切换zk话题」下拉下方（`top` 偏移）。
- 纯函数 `deriveZkNoSwitchOptions(codes, graph)` 返回选项结构，便于无 DOM 单测。

### 持久化记忆（`ZkShowPlugin`）

- `plugin.loadData()/saveData()`，数据形状 `{ lastTopicByPath: Record<string, string> }`（path → zkNo 编码）。
- 写入时机：用户通过 `ZkNoSwitch` 切换、或导航到同文件其他 zkNo 卡时，更新并 `saveData`（防抖 ~300ms，复用现有 `scheduleRebuild` 模式）。
- 读取时机：聚焦该文件时（每次 `refresh`），若记忆值仍是该文件当前有效编码之一 → 沿用；否则回退 `codes[0]`。
- 文件 frontmatter 改变导致记忆失效时自然回退，旧条目无害。

## 交互与刷新

- `refresh()` 内：解析 `codes` → 决定聚焦码 → 渲染图谱 → 更新 `ZkNoSwitch` 选项与选中态（无多编码时隐藏）。
- `ZkNoSwitch` 选中 → 设聚焦码（不开文件）→ 更新内存与持久层 → `refresh(true)` 保留视口 + `centerCanvas`。
- 现有「切换zk话题」下拉行为不变（打开根话题文件）。

## 测试

- `test/parser.test.ts`：`parseZettelkastenNoList`
  - 逗号 / 空格 / 分号 / 混合分隔
  - YAML 数组输入、数字输入、引号包裹
  - 非法段跳过、去重保序、空输入返回 `[]`
- `test/topic-graph.test.ts`：单文件多编码 → 图内多个节点共用同 path。
- 新增 `test/zkno-switch.test.ts`（happy-dom）：渲染选项、选中回调、单编码时不显示。
- `deriveZkNoSwitchOptions` 纯函数单测：去重根话题、顺序、根标题取真实/幽灵、边界同根多 zkNo。

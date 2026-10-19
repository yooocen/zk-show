# 切换 zk 话题下拉：滚动与根话题顺序 设计文档

- 日期：2026-10-18
- 状态：已确认
- 涉及文件：`src/topic-graph.ts`、`src/topic-switch.ts`、`src/zkno-switch.ts`、新增 `src/dropdown-panel.ts`、`src/main.ts`、`styles.css`、`test/`、新增 `scripts/gen-topic-switch-preview.mjs`

## 背景与目标

右上角「切换zk话题」下拉在根话题较多时不好选择。实测（无头 Chromium，真实 `TopicSwitch` + 真实 `styles.css`，20 个选项，宽 420px 的宿主视图）暴露出三个根因：

| 视图高度 | 面板 top → bottom | 视图 bottom | 滚到底后最后一项可见 |
| --- | --- | --- | --- |
| 900px | 42 → 332 | 902 | 是（`scrollTop` 可达 700） |
| 300px | 42 → 332 | 302 | 否，面板被裁 30px |
| 180px | 42 → 332 | 182 | 否，被裁 150px，过半面板在视图外 |

1. `.zk-show-topic-switch-panel` 写死 `max-height: 280px`，不感知视图可用高度。视图一变矮，面板就溢出宿主，被 `.zk-show-root { overflow: hidden }` 裁掉；被裁区域内的选项无论如何滚动都选不到。
2. 滚动条依赖系统 overlay 滚动条：实测 `panel.offsetWidth - panel.clientWidth = 2`（仅边框，无占位），Windows 上只在滚动瞬间闪现，等于「看不到滚动条」。
3. 祖先 `.zk-show-root { touch-action: none }` 会吞掉触摸滑动（面板自身 computed 为 `auto`，但有效值取祖先交集），触屏/触摸板无法滑动列表。

本次新增规格：

1. 下拉面板高度适配视图可用空间，出现滚动条，列表末尾的选项始终可以滚动选中。
2. 根话题默认按顺序（数值升序）排列。
3. 笔记库可能缺号（例如只有 1、2、5），只显示真实存在的根话题，不把不存在的 3、4 展示出来。

## 方案

### 1. 根话题来源与顺序（`src/topic-graph.ts`）

`collectRootTopics(graph)` 改为：

- **只保留真实根**：`parentId === null` 且 `!isGhost`（即存在根话题 md 文件）。幽灵根（只有 `3/1` 之类子笔记、没有 `3.md`）不再进入下拉。
- **缺号不补**：只遍历图中已有节点，绝不按 `1..max` 区间生成选项。库里是 1、2、5 就只出 1、2、5。
- **顺序**：新增 `compareRootCodes(a, b)`
  - 两个都是纯数字（`/^[0-9]+$/`）→ 按 `Number` 升序；
  - 只有一个纯数字 → 数字在前；
  - 其余 → `localeCompare(b, undefined, { numeric: true })`，相等时按原始码 `localeCompare` 稳定 tiebreak。

因为选项恒为真实根、恒可选，`RootTopicItem.isGhost`（过滤后恒为 `false`）、`TopicSwitchOption.disabled` 与 `.is-ghost` 都成为死代码，按仓库既有惯例（多次「移除不可达分支」提交）一并删除；`isGhost` 仍保留为图节点（`TopicGraphNode`）的概念。

### 2. 面板适配与滚动（新增 `src/dropdown-panel.ts`）

两个下拉（「切换zk话题」「笔记话题」）共用同一个面板样式，抽出一个只做面板几何与展开的小模块：

```ts
export const PANEL_MAX_HEIGHT = 280; // 与 styles.css 的 max-height 上限一致
export const PANEL_MIN_HEIGHT = 64;  // 视图极矮时的保底高度（约一个半条目）
export const PANEL_GAP = 4;          // 与 styles.css 的 top: calc(100% + 4px) 一致
export const PANEL_MARGIN = 8;       // 面板底部与宿主底部之间保留的间距
export const HOST_OPEN_CLASS = "zk-show-dropdown-open";

/** 可用空间足够时取上限，不足时贴合可用空间，极矮视图保底；非有限值回退上限。 */
export function panelMaxHeight(spaceBelow: number): number;

/** 把选中项滚入可视区，只改面板自身的 scrollTop，不触发祖先滚动。 */
export function scrollItemIntoView(panel: HTMLElement, item: HTMLElement): void;

/** 展开面板：按宿主可用空间限制高度 → 显示 → 标记宿主（放开触摸滚动）→ 选中项滚入视野。 */
export function openDropdownPanel(panel: HTMLElement, anchor: HTMLElement, host: HTMLElement | null): void;
```

- 高度：`spaceBelow = hostRect.bottom - anchorRect.bottom - PANEL_GAP - PANEL_MARGIN`，宿主 = `el.offsetParent ?? el.parentElement`（面板绝对定位在 `.zk-show-root` 内，`offsetParent` 即该视图根）。非有限值时回退到上限，避免无布局环境（happy-dom）写出 `NaN`。
- 选中项滚入视野用面板 `scrollTop` 手算（`offsetTop` 相对面板，面板是定位元素），不用 `scrollIntoView`，避免顺带滚动 Obsidian 视图容器。没有选中项时 `scrollTop = 0`。
- `TopicSwitch` 与 `ZkNoSwitch` 展开时调用 `openDropdownPanel`，`close()` 时移除宿主的 `HOST_OPEN_CLASS`。

### 3. 样式（`styles.css`）

`.zk-show-topic-switch-panel` 追加：

- `overscroll-behavior: contain`（滚到边界不把滚动传给画布/视图）；
- 作用域化的 `::-webkit-scrollbar`（宽 10px、thumb 用 `--background-modifier-border-hover`、track 透明）。显式样式化后 Chromium 使用**占位**的经典滚动条，不再受系统 overlay 设置影响，滚动条常显。
  不用标准属性 `scrollbar-width`/`scrollbar-color`：Chromium 一旦设置标准属性就会忽略 `::-webkit-scrollbar` 规则，行为反而不可控。
  选择器写 `.zk-show-root .zk-show-topic-switch-panel::-webkit-scrollbar`，以免被 Obsidian 全局滚动条规则按优先级覆盖。

`.zk-show-root.zk-show-dropdown-open { touch-action: pan-y; }`：

`touch-action` 的有效值是目标到视口整条祖先链的交集，祖先 `.zk-show-root { touch-action: none }` 会直接吃掉面板的纵向滑动。因此下拉展开时给宿主加 `zk-show-dropdown-open` 类放开纵向平移，收起时移除（画布拖拽在此期间仍走指针事件，现有 ignore-list 已排除下拉区域）。

删除 `.zk-show-topic-switch-item.is-ghost` 与 `.is-ghost:hover` 两条规则。

### 4. 滚轮归属（`src/main.ts`）

`onWheel` 命中 `.zk-show-topic-switch, .zk-show-zkno-switch` 时直接 `return`（沿用现有 ignore-list 写法），`Ctrl+滚轮` 不再在面板上缩放画布，滚轮交还面板原生滚动。

## 交互

- 面板高度 = `min(280, 视图可用高度 - 8)`，不低于 64px（视图极矮时允许溢出）。
- 面板内滚轮/触摸只滚动列表，到边界不外传。
- 选项恒可选；点击后回调并收起面板（行为不变）。
- 根话题列表顺序固定为数值升序，缺号跳过。

## 测试

- `test/topic-graph.test.ts`
  - 缺号：库中 1、2、5、10 → 顺序 `["1","2","5","10"]`，断言不含 `"3"`、`"4"`；
  - 幽灵根：只有 `3/1` 时 `collectRootTopics` 不返回 `"3"`；
  - 真实根保留标题；非根节点不返回。
- `test/dropdown-panel.test.ts`（新增）
  - 可用空间充足 → 上限 280；空间不足 → 贴合空间；小于保底 → 保底 64；非有限值 → 回退上限；
  - `scrollItemIntoView`：选中项在可视区上方/下方时分别修正 `scrollTop`，已在可视区则不动；
  - `openDropdownPanel`：写入面板 `maxHeight`、加 `is-open`、给宿主加 `HOST_OPEN_CLASS`。
- `test/topic-switch.test.ts`
  - 展开时写入 `panel.style.maxHeight`（happy-dom 无布局、矩形全 0，走保底分支 → `64px`），并给宿主加 `zk-show-dropdown-open`，收起后移除；
  - 删除幽灵选项用例，改为「全部选项可点击」。

## 验证

- `npm test`（改动前基线 25 文件 / 176 用例全绿）与 `npm run build` 重建 `main.js`。
- 无头 Edge 实测三档视图高度（900 / 300 / 180），断言：
  - `panel.bottom <= host.bottom - 8`（面板不再被宿主裁掉）；
  - 滚到底后最后一项 `bottom <= host.bottom`（末尾选项可选）；
  - `panel.offsetWidth - panel.clientWidth > 2`（滚动条占位、常显）。
- 新增 `scripts/gen-topic-switch-preview.mjs` 生成 `preview-topic-switch.html`，供肉眼核对多档视图高度下的滚动表现。
- 构建产物同步到 vault 插件目录（先备份现有 `main.js`/`styles.css`）。

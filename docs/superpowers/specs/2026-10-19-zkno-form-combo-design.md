# 设置 zkno 弹窗：话题根下拉 设计文档

- 日期：2026-10-19
- 状态：已确认
- 涉及文件：`src/zkno-form-modal.ts`、新增 `src/combo-field.ts`、`src/dropdown-panel.ts`、`styles.css`、`test/`、新增 `scripts/gen-zkno-combo-preview.mjs`

## 背景与目标

「设置 zettelkastenNo」弹窗里的「话题根编号」下拉有三个问题：出现幽灵节点、看不到滚动条、某些情况下选项选不中。
右上角「切换zk话题」下拉在 2026-10-18 已修过同类问题，本弹窗当时没跟上。本次把同样三条一并解决：

1. 根话题只列真实存在的根（有对应 md），幽灵根不进下拉。
2. 面板出现滚动条且常显占位，末尾选项始终能滚到并选中。
3. 面板不再被弹窗滚动容器裁掉——被裁掉的部分既看不到滚动条也点不中。

## 根因

| 现象 | 根因 |
| --- | --- |
| 幽灵节点 | `rebuildRootCombo()` 遍历所有**非幽灵**节点、取 `parseZettelkastenNo(code).path[0]` 当根。库里只有 `3/1` 而没有 `3.md` 时，`3/1` 是真实笔记，于是根 `3` 也被收进下拉，且取不到标题 → 一条「只有编码、没有标题」的空条目 |
| 看不到滚动条 | 面板只写了 `max-height + overflow-y: auto`，滚动条交给系统 overlay 样式：Windows 上只在滚动瞬间闪现。Obsidian `app.css` 的全局规则 `body:not(.native-scrollbars) ::-webkit-scrollbar` 特异性为 (0,1,2)，只写 `.zk-show-combo-panel::-webkit-scrollbar` (0,1,1) 压不过它 |
| 选不中 | 面板 `position: absolute` 挂在 `.zk-show-combo`（`position: relative`）下，而它的祖先 `.modal-content`（`overflow: auto`）与 `.modal`（`max-height: 85vh; overflow: auto`）都会裁切子元素。面板一旦越过容器底边，越界部分既不显示也不参与命中测试 |

无头 Edge 实测（复刻 app.css 弹窗几何，20 个选项，视口 1200×900）：旧实现面板底边超出 `.modal-content` 底边 14px（内容不高时）/ 199px（内容超出弹窗、滚到底时），滚到底后末尾选项 `document.elementFromPoint` 命中不到 → 点不中。

## 方案

### 1. 根话题来源（`src/zkno-form-modal.ts`）

`rebuildRootCombo()` 改用 `collectRootTopics(this.index)`：只有 `parentId === null && !isGhost` 的节点进下拉，缺号不补，按 `compareRootCodes` 数值序。与「切换zk话题」下拉同源同序。幽灵根下的编码仍可在「手动定义」里直接输入。

### 2. 抽出 `src/combo-field.ts`

`ComboField` 原本内联在 `zkno-form-modal.ts` 里，而后者 `import ... from "obsidian"`（`obsidian` 包只有类型、没有运行时代码），无法单测。抽成不依赖 obsidian 的独立模块，行为保持：input 过滤、`code　title` 回填、`mousedown` + `preventDefault` 选中、blur 延迟 150ms 收起。新增：

- `Escape` 关闭；
- 展开期间在捕获阶段监听 `document` 的 `scroll` 与窗口 `resize`，重算面板位置跟随锚点；面板自身滚动不重定位（`ev.target` 在面板内则跳过）。

### 3. 浮层面板（`src/dropdown-panel.ts`）

新增两个导出，视图内的 `openDropdownPanel` 行为不变：

```ts
export interface FixedPlacement { above: boolean; maxHeight: number }

/** 依据锚点、视口高度与面板内容高度决定展开方向与限高。 */
export function fixedPanelPlacement(
  anchor: { top: number; bottom: number },
  viewportHeight: number,
  contentHeight = 0,
): FixedPlacement

/** 以 position: fixed 展开面板：脱离弹窗滚动容器裁剪，按视口限高，选中项滚入视野。 */
export function openFixedDropdownPanel(panel: HTMLElement, anchor: HTMLElement): void
```

- `spaceBelow = 视口高 - 锚点 bottom - PANEL_GAP - PANEL_MARGIN`，`spaceAbove = 锚点 top - PANEL_GAP - PANEL_MARGIN`；
- 下方放得下整个面板（`contentHeight`，由 `panel.scrollHeight` 量得，不受 `max-height` 限制）→ 向下；
- 放不下且上方更宽敞 → 向上（用 `bottom` 定位，面板底边贴锚点顶边之上 `PANEL_GAP`）；
- 上下都不够 → 向下 + `PANEL_MIN_HEIGHT` 保底；
- `contentHeight` 取不到（≤0 或非有限）时退化为「下方够一个保底高度就向下」，无布局环境（happy-dom）下行为稳定。

浮层相对视口定位，`overflow` 祖先不再裁切它（这是「选不中」的根治手段）；代价是面板可以越过弹窗边框，与原生 select 的浮层一致。

### 4. 样式（`styles.css`）

- `.zk-show-combo-panel`：加 `box-sizing: border-box`（padding/border 计入 `max-height`）、`overscroll-behavior: contain`，`max-height` 与 `PANEL_MAX_HEIGHT` 对齐为 280px；
- 常显滚动条：`.zk-show-form .zk-show-combo-panel::-webkit-scrollbar{,-track,-thumb}`，`:0,2,1` 压过 Obsidian 全局的 (0,1,2)；不用 `scrollbar-width/scrollbar-color`（会让 `::-webkit-scrollbar` 失效）；
- `.zk-show-combo-panel.is-above { box-shadow: 0 -6px 24px … }`：向上展开时阴影朝上。

## 验证

- `npm test`：206 用例全绿（新增 `test/combo-field.test.ts` 9 条、`test/dropdown-panel.test.ts` 8 条）。
- `npx tsc --noEmit`、`npm run build` 通过。
- `node scripts/gen-zkno-combo-preview.mjs` 生成 `preview-zkno-combo.html`（真实 `ComboField` + 真实 `styles.css` + 复刻 app.css 的 `.modal-container/.modal/.modal-content` 与全局滚动条规则）。页面自带断言，无头 Edge `--dump-dom` 输出 `RESULT: PASS`：

| 案例（20 选项） | 旧实现（绝对定位） | 新实现（视口浮层） |
| --- | --- | --- |
| 内容不高、不滚动 | 面板底边超出内容区 14px，末尾项命中不到、点不中 | 向下展开，面板在视口内，滚到底可命中并点中第 20 项 |
| 内容超出弹窗、滚到底 | 超出内容区 199px、超出视口 142px，只能看到一条缝 | 翻到上方 329→609（视口 758），可命中并点中第 20 项 |
| 内容超出弹窗、4 选项 | 超出内容区 91px、超出视口 34px | 翻到上方 467→609，无需滚动即可点中第 4 项 |

  另核对滚动条特异性：同一 `.zk-show-combo-panel` 在 `.zk-show-form` 内占位 12px、在外只剩 Obsidian 全局的 14px（无头环境字号差异，关键是「内有占位、且比全局窄」）。`?hold=N` 可保留第 N 个案例的弹窗，便于肉眼核对。
